/**
 * The local settings drawer's model (§8), and every preference the interface
 * remembers.
 *
 * One typed store rather than a hook per setting. `interfaces.md` §8 defines
 * fourteen settings with defaults, option sets and number bounds, and a schema
 * that states them once is what makes the drawer's controls data-driven: the
 * drawer renders `PREFERENCE_FIELDS`, and a new preference is a row here rather
 * than a new hook, a new localStorage key and a new control.
 *
 * Two properties are load-bearing:
 *
 * **Reads fall back, writes swallow.** Storage can be missing (tests, SSR),
 * blocked (private mode) or full, and none of those is worth breaking a page
 * over. A stored value from an older build is parsed against the schema, so an
 * option that no longer exists falls back to the default instead of rendering a
 * control with nothing selected.
 *
 * **The default is written on first run.** §8 asks for it, and it is what makes
 * "the user chose the default" and "nothing was ever chosen" the same answer for
 * every reader below.
 */

import { useSyncExternalStore } from "react";
import { DEFAULT_VIEWPORT_ZOOM_MAX, MAX_VIEWPORT_ZOOM_MAX, MIN_VIEWPORT_ZOOM } from "./viewport-zoom";

/** Every key this app stores is namespaced, so clearing one prefix clears it all. */
export const PREFERENCE_PREFIX = "edgelist:";

const PREFIX = PREFERENCE_PREFIX;

/* --------------------------------------------------------------- the schema */

export type LayoutMode = "list" | "grid" | "image";
export type FolderInImageView = "top" | "bottom" | "none";
export type Visibility = "none" | "visible";
export type NavbarPosition = "static" | "sticky" | "only_navbar_sticky";
export type FilenameOverflow = "ellipsis" | "scrollable" | "multi_line";
export type OpenOnCheckbox = "direct" | "dblclick" | "disable_while_checked";
export type Toggle = "off" | "on";

/**
 * The value each preference holds, and what a control can offer.
 *
 * `number` entries carry their bounds here rather than at the control, so the
 * stepper and the parser agree on the range by construction.
 */
type PreferenceOption = { value: string; label: string };

type PreferenceSpec =
	| { kind: "text"; default: string; label: string; placeholder?: string }
	| { kind: "number"; default: number; label: string; min: number; max?: number; decimals?: number }
	| { kind: "enum"; default: string; label: string; options: readonly PreferenceOption[] };

const layoutOptions: readonly PreferenceOption[] = [
	{ value: "list", label: "home.layouts.list" },
	{ value: "grid", label: "home.layouts.grid" },
	{ value: "image", label: "home.layouts.image" },
];

/**
 * Every setting: §8's table in its own order, with adaptive zoom first.
 *
 * `label` and each option's `label` are message keys, not text: the drawer
 * translates them, so this module stays free of the language store and can be
 * imported by a plain unit test.
 */
export const PREFERENCE_SPECS = {
	/**
	 * Adaptive zoom is a schema entry rather than a separate store, but its
	 * control is not the generic stepper: the ceiling is a fractional value and
	 * the drawer draws it as a slider. Both keys therefore stay out of
	 * `PREFERENCE_ORDER`, which is the generic list.
	 */
	auto_viewport_zoom: {
		kind: "enum",
		default: "on",
		label: "local.auto_viewport_zoom",
		options: [
			{ value: "off", label: "local.off" },
			{ value: "on", label: "local.on" },
		],
	},
	auto_viewport_zoom_max: {
		kind: "number",
		default: DEFAULT_VIEWPORT_ZOOM_MAX,
		label: "local.auto_viewport_zoom_max",
		min: MIN_VIEWPORT_ZOOM,
		max: MAX_VIEWPORT_ZOOM_MAX,
		decimals: 2,
	},
	aria2_rpc_url: {
		kind: "text",
		default: "http://localhost:6800/jsonrpc",
		label: "local.aria2_rpc_url",
	},
	aria2_rpc_secret: { kind: "text", default: "", label: "local.aria2_rpc_secret" },
	global_default_layout: {
		kind: "enum",
		default: "list",
		label: "local.global_default_layout",
		options: layoutOptions,
	},
	show_folder_in_image_view: {
		kind: "enum",
		default: "top",
		label: "local.show_folder_in_image_view",
		options: [
			{ value: "top", label: "local.top" },
			{ value: "bottom", label: "local.bottom" },
			{ value: "none", label: "local.none" },
		],
	},
	show_sidebar: {
		kind: "enum",
		default: "none",
		label: "local.show_sidebar",
		options: [
			{ value: "none", label: "local.none" },
			{ value: "visible", label: "local.visible" },
		],
	},
	show_count_msg: {
		kind: "enum",
		default: "none",
		label: "local.show_count_msg",
		options: [
			{ value: "none", label: "local.none" },
			{ value: "visible", label: "local.visible" },
		],
	},
	position_of_header_navbar: {
		kind: "enum",
		default: "static",
		label: "local.position_of_header_navbar",
		options: [
			{ value: "static", label: "local.static" },
			{ value: "sticky", label: "local.sticky" },
			{ value: "only_navbar_sticky", label: "local.only_navbar_sticky" },
		],
	},
	grid_item_size: { kind: "number", default: 90, label: "local.grid_item_size", min: 1, max: 240 },
	list_item_filename_overflow: {
		kind: "enum",
		default: "ellipsis",
		label: "local.list_item_filename_overflow",
		options: [
			{ value: "ellipsis", label: "local.ellipsis" },
			{ value: "scrollable", label: "local.scrollable" },
			{ value: "multi_line", label: "local.multi_line" },
		],
	},
	open_item_on_checkbox: {
		kind: "enum",
		default: "direct",
		label: "local.open_item_on_checkbox",
		options: [
			{ value: "direct", label: "local.direct" },
			{ value: "dblclick", label: "local.dblclick" },
			{ value: "disable_while_checked", label: "local.disable_while_checked" },
		],
	},
	editor_font_size: { kind: "number", default: 14, label: "local.editor_font_size", min: 8, max: 40 },
	editor_word_wrap: {
		kind: "enum",
		default: "off",
		label: "local.editor_word_wrap",
		options: [
			{ value: "off", label: "local.off" },
			{ value: "on", label: "local.on" },
		],
	},
	editor_minimap: {
		kind: "enum",
		default: "on",
		label: "local.editor_minimap",
		options: [
			{ value: "off", label: "local.off" },
			{ value: "on", label: "local.on" },
		],
	},
	show_gallery_thumbnails: {
		kind: "enum",
		default: "visible",
		label: "local.show_gallery_thumbnails",
		options: [
			{ value: "none", label: "local.none" },
			{ value: "visible", label: "local.visible" },
		],
	},
} as const satisfies Record<string, PreferenceSpec>;

export type PreferenceKey = keyof typeof PREFERENCE_SPECS;

/**
 * The value type one setting holds.
 *
 * Derived from the *option list* where there is one, not from the default: a
 * literal `"off"` default would make `setPreference("editor_word_wrap", "on")` a type
 * error, and the setter's job is to accept any option the control can offer.
 */
export type PreferenceValue<K extends PreferenceKey> = (typeof PREFERENCE_SPECS)[K] extends {
	kind: "enum";
	options: readonly (infer O)[];
}
	? O extends { value: infer V }
		? V
		: never
	: (typeof PREFERENCE_SPECS)[K] extends { kind: "number" }
		? number
		: (typeof PREFERENCE_SPECS)[K]["default"];

/** The §8 settings in the drawer's generated order; adaptive zoom has its own section. */
export const PREFERENCE_ORDER: PreferenceKey[] = [
	"aria2_rpc_url",
	"aria2_rpc_secret",
	"global_default_layout",
	"show_folder_in_image_view",
	"show_sidebar",
	"show_count_msg",
	"position_of_header_navbar",
	"grid_item_size",
	"list_item_filename_overflow",
	"open_item_on_checkbox",
	"editor_font_size",
	"editor_word_wrap",
	"editor_minimap",
	"show_gallery_thumbnails",
];

/* --------------------------------------------------------------- the storage */

function read(key: string): string | null {
	try {
		return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
	} catch {
		return null;
	}
}

function write(key: string, value: string | null) {
	try {
		if (value === null) globalThis.localStorage?.removeItem(PREFIX + key);
		else globalThis.localStorage?.setItem(PREFIX + key, value);
	} catch {
		// Private mode or a full quota: the value stays in memory for this session.
	}
}

/**
 * Coerce a stored string to the type the schema declares.
 *
 * A number is clamped to its bounds rather than rejected, because a hand-edited
 * or out-of-date value is still an attempt at a legitimate setting; an enum value
 * that is not in the option list falls back to the default, because a control
 * with nothing selected is worse than a default.
 */
function coerce(key: PreferenceKey, raw: string | null): string | number {
	const spec = PREFERENCE_SPECS[key];
	if (raw === null) return spec.default;
	if (spec.kind === "number") {
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return spec.default;
		const clamped = Math.max(spec.min, spec.max === undefined ? parsed : Math.min(spec.max, parsed));
		if (!("decimals" in spec)) return Math.trunc(clamped);
		const factor = 10 ** spec.decimals;
		return Math.round(clamped * factor) / factor;
	}
	if (spec.kind === "enum") {
		const allowed = spec.options.map((option) => option.value as string);
		return allowed.includes(raw) ? raw : spec.default;
	}
	return raw;
}

const values = new Map<PreferenceKey, string | number>();
const listeners = new Set<() => void>();

function load() {
	// Every spec, not only the visible order: the zoom settings are drawn by
	// their own section and still need a value (and a first-run default) here.
	for (const key of Object.keys(PREFERENCE_SPECS) as PreferenceKey[]) {
		const stored = read(key);
		// §8: first run writes the default, so nothing downstream has to tell
		// "not chosen" from "chosen as the default".
		if (stored === null) write(key, String(PREFERENCE_SPECS[key].default));
		values.set(key, coerce(key, stored));
	}
}

load();

function emit() {
	for (const listener of listeners) listener();
}

export function getPreference<K extends PreferenceKey>(key: K): PreferenceValue<K> {
	return values.get(key) as PreferenceValue<K>;
}

export function setPreference<K extends PreferenceKey>(key: K, value: PreferenceValue<K>) {
	const next = coerce(key, String(value));
	if (values.get(key) === next) return;
	values.set(key, next);
	write(key, String(next));
	emit();
}

export function subscribePreferences(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** One setting, as React sees it. */
export function usePreference<K extends PreferenceKey>(key: K): PreferenceValue<K> {
	return useSyncExternalStore(
		subscribePreferences,
		() => getPreference(key),
		() => getPreference(key),
	);
}

/* ------------------------------------------------------- per-path memory ---
 *
 * Two records are keyed by path rather than by setting, because they answer a
 * question about one directory: which layout the user last used there, and how
 * they last sorted it. §4 gives the semantics — the layout falls back to
 * `global_default_layout`, the sort to name-ascending — and both live in one JSON
 * blob each so a directory that was never visited costs no key at all.
 */

const LAYOUT_RECORD = "layout-record";
const SORT_RECORD = "sort-record";

function readRecord<T>(key: string): Record<string, T> {
	try {
		const raw = globalThis.localStorage?.getItem(PREFIX + key);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {};
	} catch {
		return {};
	}
}

function writeRecord(key: string, record: Record<string, unknown>) {
	write(key, JSON.stringify(record));
}

export type SortState = { field: "name" | "size" | "modified"; direction: "asc" | "desc" };
export const DEFAULT_SORT: SortState = { field: "name", direction: "asc" };

const layoutRecord = readRecord<LayoutMode>(LAYOUT_RECORD);
const sortRecord = readRecord<SortState>(SORT_RECORD);
const pathListeners = new Set<() => void>();

function emitPath() {
	for (const listener of pathListeners) listener();
}

export function layoutFor(path: string): LayoutMode {
	const stored = layoutRecord[path];
	if (stored === "grid" || stored === "image" || stored === "list") return stored;
	return getPreference("global_default_layout") as LayoutMode;
}

export function setLayoutFor(path: string, layout: LayoutMode) {
	layoutRecord[path] = layout;
	writeRecord(LAYOUT_RECORD, layoutRecord);
	emitPath();
}

export function sortFor(path: string): SortState {
	const stored = sortRecord[path];
	if (!stored || typeof stored !== "object") return DEFAULT_SORT;
	if (stored.field !== "name" && stored.field !== "size" && stored.field !== "modified") return DEFAULT_SORT;
	return { field: stored.field, direction: stored.direction === "desc" ? "desc" : "asc" };
}

export function setSortFor(path: string, sort: SortState) {
	sortRecord[path] = sort;
	writeRecord(SORT_RECORD, sortRecord);
	emitPath();
}

export function subscribePathRecords(listener: () => void): () => void {
	pathListeners.add(listener);
	return () => {
		pathListeners.delete(listener);
	};
}

/** The layout for a path, as React sees it. */
export function useLayoutFor(path: string): LayoutMode {
	return useSyncExternalStore(
		subscribePathRecords,
		() => layoutFor(path),
		() => layoutFor(path),
	);
}

/** The sort for a path, as React sees it. */
export function useSortFor(path: string): SortState {
	return useSyncExternalStore(
		subscribePathRecords,
		() => sortFor(path),
		() => sortFor(path),
	);
}

/* ------------------------------------------------------ plain persisted keys
 *
 * Three values are neither a setting nor per-path: the checkbox mode, whether the
 * markdown outline was switched off, and the language and theme choices (which
 * have their own modules). They still belong to the same prefix, so clearing
 * `edgelist:` clears the app.
 */

export function readFlag(key: string): string | null {
	return read(key);
}

export function writeFlag(key: string, value: string | null) {
	write(key, value);
}

export const CHECKBOX_MODE_KEY = "checkbox-mode";
export const TOC_DISABLED_KEY = "toc-disabled";
export const LOCALE_KEY = "locale";
export const THEME_KEY = "theme";
export const TOKEN_KEY = "token";

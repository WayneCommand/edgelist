/**
 * UI preferences that survive a reload.
 *
 * Everything is stored in `localStorage` under one prefix, so the keys this app
 * owns are easy to spot (and to clear). Storage can be unavailable — Safari
 * private mode, blocked cookies, a full quota, or a plain Node process during
 * tests — and can hold values written by an older build, so reads fall back
 * instead of throwing and writes swallow failures. A remembered view mode is
 * never important enough to break the page.
 *
 * Values are kept as plain strings: the preferences we persist (view mode, sort
 * order) are short enums, so JSON encoding would only add a parse step.
 */

import type { SortField, SortState } from "./types";

const PREFIX = "edgelist:";

/** Key holding the file list view mode. Global, shared by every directory. */
export const VIEW_MODE_KEY = "view-mode";

/** `list` renders the table, `grid` renders tiles. */
export type ViewMode = "list" | "grid";

export const DEFAULT_VIEW_MODE: ViewMode = "list";

export function readPreference(key: string, fallback: string): string {
	try {
		return globalThis.localStorage.getItem(PREFIX + key) ?? fallback;
	} catch {
		// No storage (private mode, blocked cookies) or no `localStorage` at all.
		return fallback;
	}
}

export function writePreference(key: string, value: string): void {
	try {
		globalThis.localStorage.setItem(PREFIX + key, value);
	} catch {
		// Private mode or a full quota: keep the value for this session only.
	}
}

/** Unknown values (an older build, a hand-edited key) fall back to the table. */
export function parseViewMode(raw: string): ViewMode {
	return raw === "grid" ? "grid" : DEFAULT_VIEW_MODE;
}

export const DEFAULT_SORT_STATE: SortState = { field: "name", direction: "asc" };

/** Sort order is remembered per directory, like OpenList's `dir_sort_<path>`. */
export function sortKeyFor(path: string): string {
	return `sort:${path}`;
}

function isSortField(value: string | undefined): value is SortField {
	return value === "name" || value === "size" || value === "modified";
}

/**
 * Stored as `"name:asc"`. A short string rather than JSON so the value is a
 * primitive: callers can safely put it in a dependency array without the
 * identity churn a freshly parsed object would bring.
 */
export function serializeSortState(state: SortState): string {
	return `${state.field}:${state.direction}`;
}

export function parseSortState(raw: string): SortState {
	const [field, direction] = raw.split(":");
	if (!isSortField(field)) return DEFAULT_SORT_STATE;
	return { field, direction: direction === "desc" ? "desc" : "asc" };
}

/** Clicking the active column flips the direction; another column starts ascending. */
export function nextSortState(current: SortState, field: SortField): SortState {
	if (current.field !== field) return { field, direction: "asc" };
	return { field, direction: current.direction === "asc" ? "desc" : "asc" };
}

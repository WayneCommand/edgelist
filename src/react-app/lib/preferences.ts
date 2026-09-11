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

/**
 * Sorting and paging, in the shape §4.1 and §4.7 describe.
 *
 * In memory rather than on the server, and that is a decision worth stating: a
 * click on a column header has to reorder the list *instantly* — the spec says the
 * sort is applied in place — so the listing is fetched whole (`per_page: 0`) and
 * sorted here. A round trip per column click would be slower and would also change
 * what "the page you are on" means underneath the user.
 *
 * The comparison is natural (`file-2` before `file-10`) and compares text runs by
 * code point, so the result does not depend on the runtime's locale — a directory
 * must not sort differently for two users looking at the same storage.
 */

import type { FileObject } from "./types";
import type { SortState } from "./preferences";

function chunks(value: string): Array<string | number> {
	const parts: Array<string | number> = [];
	for (const [text] of value.matchAll(/\d+|\D+/g)) {
		parts.push(/^\d+$/.test(text) ? Number(text) : text);
	}
	return parts;
}

/** Natural ordering: digit runs compare as numbers, everything else by code point. */
export function compareNatural(left: string, right: string): number {
	const a = chunks(left);
	const b = chunks(right);
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
		const leftChunk = a[index];
		const rightChunk = b[index];
		if (leftChunk === undefined) return -1;
		if (rightChunk === undefined) return 1;
		if (typeof leftChunk === "number" && typeof rightChunk === "number") {
			if (leftChunk !== rightChunk) return leftChunk - rightChunk;
			continue;
		}
		// A number sorts before a letter, which keeps `1.txt` ahead of `a.txt`.
		if (typeof leftChunk === "number" || typeof rightChunk === "number") return typeof leftChunk === "number" ? -1 : 1;
		if (leftChunk !== rightChunk) return leftChunk < rightChunk ? -1 : 1;
	}
	return 0;
}

function timestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Sorts a listing.
 *
 * Folders come first unconditionally, then the chosen key applies inside each
 * group. That is what a file manager does and what the spec's screenshots show;
 * an option to put folders last would be a second rule to state, and the wire
 * already carries `extract_folder` for a storage that wants it.
 */
export function sortItems(items: readonly FileObject[], sort: SortState): FileObject[] {
	const direction = sort.direction === "desc" ? -1 : 1;
	return [...items].sort((left, right) => {
		if (left.is_dir !== right.is_dir) return left.is_dir ? -1 : 1;
		switch (sort.field) {
			case "size":
				return (left.size - right.size) * direction;
			case "modified":
				return (timestamp(left.modified) - timestamp(right.modified)) * direction;
			default:
				return compareNatural(left.name, right.name) * direction;
		}
	});
}

/** Clicking the active column flips the direction; another column starts ascending. */
export function nextSort(current: SortState, field: SortState["field"]): SortState {
	if (current.field !== field) return { field, direction: "asc" };
	return { field, direction: current.direction === "asc" ? "desc" : "asc" };
}

/* --------------------------------------------------------------------- paging */

/**
 * How many pages a total needs. A zero page size is one endless page.
 *
 * §4.7's `pagination_type` maps to `all` → no controls, `pagination` → the page
 * bar, `load_more` / `auto_load_more` → an appending list. The Worker has no
 * per-site setting for it, so the interface keeps it as a local preference and
 * spells "everything on one page" as size 0.
 */
export function pageCount(total: number, size: number): number {
	if (size <= 0) return 1;
	return Math.max(1, Math.ceil(total / size));
}

/** The 1-based inclusive range the current page shows. */
export function pageRange(page: number, size: number, total: number): { from: number; to: number } {
	if (total <= 0) return { from: 0, to: 0 };
	if (size <= 0) return { from: 1, to: total };
	const from = (Math.max(1, page) - 1) * size + 1;
	return { from, to: Math.min(total, from + size - 1) };
}

/** Pulls a page number back inside the range the current total allows. */
export function clampPage(page: number, total: number, size: number): number {
	return Math.min(Math.max(1, page), pageCount(Math.max(0, total), size));
}

/** A page number, or a run of skipped pages collapsed into one ellipsis. */
export type PageItem = number | "gap";

/**
 * §4.7's windowed page list: the current page plus its neighbours, and a `gap`
 * wherever pages were skipped.
 *
 * Deliberately *not* the spec's literal rule, which shows "1" and "last" as
 * separate buttons either side of the window. Rendering 500 buttons for a 500-page
 * directory is the thing this prevents; showing the first and last page inside the
 * same row is the same information in one control.
 */
export function pageNumbers(current: number, pages: number, window = 1): PageItem[] {
	if (pages <= 1) return [];
	const wanted = new Set<number>([1, pages]);
	for (let offset = -window; offset <= window; offset += 1) {
		const page = current + offset;
		if (page >= 1 && page <= pages) wanted.add(page);
	}
	const sorted = [...wanted].sort((left, right) => left - right);
	const items: PageItem[] = [];
	for (const page of sorted) {
		const previous = items[items.length - 1];
		if (typeof previous === "number" && page - previous > 1) items.push("gap");
		items.push(page);
	}
	return items;
}

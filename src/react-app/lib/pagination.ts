/**
 * The arithmetic behind the pager, kept out of the component so it can be
 * checked without a DOM.
 *
 * Every value here is derived from what the server already told us (`total`) and
 * the page the user is on, so the pager never has to guess whether there is more
 * to fetch.
 */

/** `fsList` reads `per_page: 0` as "no pagination", so "all" is spelled as zero. */
export const ALL_PAGES = 0;

/**
 * `fsSearch` cannot be asked for everything with a zero: it clamps the value up
 * (`Math.max(1, input.per_page ?? 100)`), so unlike `fsList` a zero there means
 * "one result". "All" therefore has to be spelled as a large number. Search is
 * already bounded server-side by `max_dirs` / `max_depth`, so this is a ceiling
 * on what the client asks for, not a promise that it will all arrive.
 */
export const SEARCH_ALL = 10000;

/** Translates the page size the user picked into what the endpoint expects. */
export function perPageFor(size: number, endpoint: "list" | "search"): number {
	if (size > 0) return size;
	return endpoint === "search" ? SEARCH_ALL : ALL_PAGES;
}

/** How many pages a total needs. A zero page size is one endless page. */
export function pageCount(total: number, size: number): number {
	if (size <= 0) return 1;
	return Math.max(1, Math.ceil(total / size));
}

/**
 * Pulls a page number back inside the range the current total allows.
 *
 * Deleting the last entry of the last page leaves the user on a page the server
 * no longer has; asking for it would render an empty list with no way to tell
 * whether the directory is empty or the page is simply past the end.
 */
export function clampPage(page: number, total: number, size: number): number {
	return Math.min(Math.max(1, page), pageCount(Math.max(0, total), size));
}

/** The 1-based inclusive range the current page shows, for "1–100 of 342". */
export function pageRange(page: number, size: number, total: number): { from: number; to: number } {
	if (total <= 0) return { from: 0, to: 0 };
	if (size <= 0) return { from: 1, to: total };
	const from = (Math.max(1, page) - 1) * size + 1;
	return { from, to: Math.min(total, from + size - 1) };
}

/** A page number, or a run of skipped pages collapsed into one ellipsis. */
export type PageItem = number | "gap";

/**
 * The windowed page list: the first and last page always, the current page plus
 * `window` neighbours, and a `"gap"` wherever pages were skipped. This is the
 * shape OpenList's paginator produces, and it keeps a 500-page directory from
 * rendering 500 buttons.
 */
export function pageNumbers(current: number, pages: number, window = 1): PageItem[] {
	const wanted = new Set<number>([1, pages]);
	for (let offset = -window; offset <= window; offset++) {
		const page = current + offset;
		if (page >= 1 && page <= pages) wanted.add(page);
	}
	const items: PageItem[] = [];
	for (const page of [...wanted].sort((left, right) => left - right)) {
		const previous = items[items.length - 1];
		if (typeof previous === "number" && page - previous > 1) items.push("gap");
		items.push(page);
	}
	return items;
}

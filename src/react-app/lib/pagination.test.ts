import { describe, expect, it } from "vitest";
import { ALL_PAGES, SEARCH_ALL, clampPage, pageCount, pageNumbers, pageRange, perPageFor } from "./pagination";

describe("perPageFor", () => {
	it("passes a real page size straight through", () => {
		expect(perPageFor(100, "list")).toBe(100);
		expect(perPageFor(100, "search")).toBe(100);
	});

	it("asks the listing for everything with a zero", () => {
		expect(perPageFor(0, "list")).toBe(ALL_PAGES);
	});

	it("spells 'all' as a large number for search, which reads zero as one", () => {
		expect(perPageFor(0, "search")).toBe(SEARCH_ALL);
	});
});

describe("pageCount", () => {
	it("rounds a partial last page up", () => {
		expect(pageCount(342, 100)).toBe(4);
	});

	it("counts an exact multiple exactly", () => {
		expect(pageCount(300, 100)).toBe(3);
	});

	it("still has one page when there is nothing to show", () => {
		expect(pageCount(0, 100)).toBe(1);
	});

	it("treats a zero page size as one endless page", () => {
		expect(pageCount(5000, 0)).toBe(1);
	});
});

describe("pageRange", () => {
	it("reports the 1-based inclusive range of the current page", () => {
		expect(pageRange(1, 100, 342)).toEqual({ from: 1, to: 100 });
		expect(pageRange(4, 100, 342)).toEqual({ from: 301, to: 342 });
	});

	it("reports nothing for an empty directory", () => {
		expect(pageRange(1, 100, 0)).toEqual({ from: 0, to: 0 });
	});

	it("covers everything when there is no page size", () => {
		expect(pageRange(1, 0, 342)).toEqual({ from: 1, to: 342 });
	});
});

describe("clampPage", () => {
	it("pulls a page past the end back to the last one", () => {
		expect(clampPage(5, 342, 100)).toBe(4);
	});

	it("never goes below the first page", () => {
		expect(clampPage(0, 342, 100)).toBe(1);
		expect(clampPage(-3, 342, 100)).toBe(1);
	});

	it("leaves a page that is still in range alone", () => {
		expect(clampPage(2, 342, 100)).toBe(2);
	});

	it("falls back to the first page once everything is gone", () => {
		expect(clampPage(3, 0, 100)).toBe(1);
	});
});

describe("pageNumbers", () => {
	it("lists every page when there are few", () => {
		expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
	});

	it("collapses the pages it skips", () => {
		expect(pageNumbers(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
	});

	it("does not repeat the first page when the window reaches it", () => {
		expect(pageNumbers(1, 10)).toEqual([1, 2, "gap", 10]);
	});

	it("does not repeat the last page when the window reaches it", () => {
		expect(pageNumbers(10, 10)).toEqual([1, "gap", 9, 10]);
	});

	it("returns the only page for a single-page list", () => {
		expect(pageNumbers(1, 1)).toEqual([1]);
	});

	it("widens the window when asked", () => {
		expect(pageNumbers(6, 20, 2)).toEqual([1, "gap", 4, 5, 6, 7, 8, "gap", 20]);
	});
});

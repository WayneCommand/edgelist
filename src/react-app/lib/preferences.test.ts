import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_PAGE_MODE,
	DEFAULT_PAGE_SIZE,
	DEFAULT_SORT_STATE,
	DEFAULT_VIEW_MODE,
	PAGE_SIZE_OPTIONS,
	VIEW_MODE_KEY,
	nextSortState,
	parsePageMode,
	parsePageSize,
	parseSortState,
	parseViewMode,
	readPreference,
	serializePageSize,
	serializeSortState,
	sortKeyFor,
	writePreference,
} from "./preferences";

/** Minimal in-memory `localStorage`, since the suite runs in a Node environment. */
function fakeStorage() {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => void entries.set(key, value),
		removeItem: (key: string) => void entries.delete(key),
		clear: () => entries.clear(),
		key: (index: number) => [...entries.keys()][index] ?? null,
		get length() {
			return entries.size;
		},
	};
}

describe("preferences", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", fakeStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("round-trips a value under the app prefix", () => {
		writePreference("view-mode", "grid");
		expect(readPreference("view-mode", "list")).toBe("grid");
		expect(globalThis.localStorage.getItem("edgelist:view-mode")).toBe("grid");
	});

	it("falls back when the key was never written", () => {
		expect(readPreference("missing", "list")).toBe("list");
	});

	it("survives storage being unavailable", () => {
		vi.stubGlobal("localStorage", undefined);
		expect(readPreference(VIEW_MODE_KEY, "list")).toBe("list");
		expect(() => writePreference(VIEW_MODE_KEY, "grid")).not.toThrow();
	});

	it("ignores values written by an older build", () => {
		expect(parseViewMode("grid")).toBe("grid");
		expect(parseViewMode("list")).toBe("list");
		// OpenList also has an `image` layout, which this build does not render yet.
		expect(parseViewMode("image")).toBe(DEFAULT_VIEW_MODE);
		expect(parseViewMode("")).toBe(DEFAULT_VIEW_MODE);
	});
});

describe("sort preferences", () => {
	it("scopes the key to the directory", () => {
		expect(sortKeyFor("/photos")).toBe("sort:/photos");
		expect(sortKeyFor("/")).toBe("sort:/");
	});

	it("round-trips through the stored string", () => {
		expect(serializeSortState({ field: "size", direction: "desc" })).toBe("size:desc");
		expect(parseSortState("size:desc")).toEqual({ field: "size", direction: "desc" });
		expect(parseSortState(serializeSortState(DEFAULT_SORT_STATE))).toEqual(DEFAULT_SORT_STATE);
	});

	it("falls back for unknown or partial values", () => {
		expect(parseSortState("")).toEqual(DEFAULT_SORT_STATE);
		expect(parseSortState("created:asc")).toEqual(DEFAULT_SORT_STATE);
		expect(parseSortState("name")).toEqual({ field: "name", direction: "asc" });
		// Anything that is not `desc` is ascending, matching the worker's own default.
		expect(parseSortState("name:sideways")).toEqual({ field: "name", direction: "asc" });
	});

	it("flips the direction only for the active column", () => {
		expect(nextSortState({ field: "name", direction: "asc" }, "name")).toEqual({ field: "name", direction: "desc" });
		expect(nextSortState({ field: "name", direction: "desc" }, "name")).toEqual({ field: "name", direction: "asc" });
		expect(nextSortState({ field: "name", direction: "desc" }, "size")).toEqual({ field: "size", direction: "asc" });
	});
});

describe("paging preferences", () => {
	it("round-trips a page size", () => {
		expect(serializePageSize(100)).toBe("100");
		expect(parsePageSize("100")).toBe(100);
	});

	it("spells 'all' as a word rather than a zero", () => {
		expect(serializePageSize(0)).toBe("all");
		expect(parsePageSize("all")).toBe(0);
	});

	it("falls back for anything unrecognised", () => {
		expect(parsePageSize("")).toBe(DEFAULT_PAGE_SIZE);
		expect(parsePageSize("banana")).toBe(DEFAULT_PAGE_SIZE);
		expect(parsePageSize("0")).toBe(DEFAULT_PAGE_SIZE);
		expect(parsePageSize("-5")).toBe(DEFAULT_PAGE_SIZE);
		// A size the selector cannot show would leave it disagreeing with the request.
		expect(parsePageSize("5")).toBe(DEFAULT_PAGE_SIZE);
	});

	it("keeps the page size the app used before the setting existed", () => {
		expect(DEFAULT_PAGE_SIZE).toBe(200);
		expect(parsePageSize(serializePageSize(DEFAULT_PAGE_SIZE))).toBe(DEFAULT_PAGE_SIZE);
	});

	it("defaults to replacing the page rather than growing it", () => {
		expect(parsePageMode("pagination")).toBe("pagination");
		expect(parsePageMode("load_more")).toBe("load_more");
		expect(parsePageMode("")).toBe(DEFAULT_PAGE_MODE);
		expect(parsePageMode("infinite")).toBe(DEFAULT_PAGE_MODE);
	});

	it("offers every page size option as a parseable value", () => {
		for (const size of PAGE_SIZE_OPTIONS) {
			expect(parsePageSize(serializePageSize(size))).toBe(size);
		}
	});
});

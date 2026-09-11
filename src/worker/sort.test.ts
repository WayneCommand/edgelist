import { describe, expect, it } from "vitest";
import type { FileObject } from "./storage/types";
import { applySort, compareNatural, DEFAULT_SORT, extractFolder, resolveSort, sortObjects } from "./sort";

function item(name: string, extra: Partial<FileObject> = {}): FileObject {
	return { name, size: 0, is_dir: false, modified: "", created: "", path: `/${name}`, ...extra };
}

describe("natural ordering", () => {
	it("orders number runs by value", () => {
		expect(compareNatural("file-2", "file-10")).toBeLessThan(0);
		expect(compareNatural("file-10", "file-2")).toBeGreaterThan(0);
		expect(compareNatural("file-2", "file-2")).toBe(0);
	});

	it("orders a shorter name first when the prefix matches", () => {
		expect(compareNatural("a", "ab")).toBeLessThan(0);
		expect(compareNatural("ab", "a")).toBeGreaterThan(0);
	});

	it("puts number runs before text runs", () => {
		expect(compareNatural("1", "a")).toBeLessThan(0);
	});

	it("sorts a mixed list the way a person expects", () => {
		expect(["file-10", "file-2", "file-1"].sort(compareNatural)).toEqual(["file-1", "file-2", "file-10"]);
	});
});

describe("object sorting", () => {
	const items = [
		item("b", { size: 2, modified: "2024-02-02T00:00:00.000Z" }),
		item("a", { size: 30, modified: "2024-03-01T00:00:00.000Z" }),
		item("c", { size: 10, modified: "2024-01-01T00:00:00.000Z" }),
	];

	it("keeps the storage order when orderBy is empty", () => {
		expect(sortObjects(items, "", "asc").map((entry) => entry.name)).toEqual(["b", "a", "c"]);
	});

	it("sorts by name in both directions", () => {
		expect(sortObjects(items, "name", "asc").map((entry) => entry.name)).toEqual(["a", "b", "c"]);
		expect(sortObjects(items, "name", "desc").map((entry) => entry.name)).toEqual(["c", "b", "a"]);
	});

	it("sorts by size in both directions", () => {
		expect(sortObjects(items, "size", "asc").map((entry) => entry.size)).toEqual([2, 10, 30]);
		expect(sortObjects(items, "size", "desc").map((entry) => entry.size)).toEqual([30, 10, 2]);
	});

	it("sorts by modified time in both directions", () => {
		expect(sortObjects(items, "modified", "asc").map((entry) => entry.name)).toEqual(["c", "b", "a"]);
		expect(sortObjects(items, "modified", "desc").map((entry) => entry.name)).toEqual(["a", "b", "c"]);
	});

	it("does not mutate the input", () => {
		const original = items.map((entry) => entry.name);
		sortObjects(items, "name", "desc");
		extractFolder(items, "front");
		expect(items.map((entry) => entry.name)).toEqual(original);
	});
});

describe("folder extraction", () => {
	const items = [item("a.txt"), item("dir1", { is_dir: true }), item("b.txt"), item("dir2", { is_dir: true })];

	it("moves directories to the front", () => {
		expect(extractFolder(items, "front").map((entry) => entry.name)).toEqual(["dir1", "dir2", "a.txt", "b.txt"]);
	});

	it("moves directories to the back", () => {
		expect(extractFolder(items, "back").map((entry) => entry.name)).toEqual(["a.txt", "b.txt", "dir1", "dir2"]);
	});

	it("keeps the previous order inside each group", () => {
		const sorted = sortObjects(items, "name", "desc");
		expect(extractFolder(sorted, "front").map((entry) => entry.name)).toEqual(["dir2", "dir1", "b.txt", "a.txt"]);
	});

	it("leaves the order alone when no position is configured", () => {
		expect(extractFolder(items, "").map((entry) => entry.name)).toEqual(["a.txt", "dir1", "b.txt", "dir2"]);
	});
});

describe("sort settings", () => {
	it("prefers the request over the storage", () => {
		expect(resolveSort({ order_by: "size" }, { order_by: "name" })).toMatchObject({ orderBy: "size" });
	});

	it("falls back to the storage", () => {
		expect(resolveSort({}, { order_by: "modified", order_direction: "desc", extract_folder: "back" })).toEqual({
			orderBy: "modified",
			orderDirection: "desc",
			extractFolder: "back",
		});
	});

	it("falls back to the defaults when nothing is configured", () => {
		expect(resolveSort()).toEqual(DEFAULT_SORT);
		expect(resolveSort({}, undefined)).toEqual({ orderBy: "name", orderDirection: "asc", extractFolder: "front" });
	});

	it("honours an empty storage value instead of replacing it", () => {
		expect(resolveSort({}, { order_by: "" })).toMatchObject({ orderBy: "" });
	});

	it("ignores values that are not strings", () => {
		expect(resolveSort({}, { order_by: 42 })).toMatchObject({ orderBy: "name" });
	});
});

describe("applySort", () => {
	const items = [item("b.txt"), item("dirB", { is_dir: true }), item("a.txt"), item("dirA", { is_dir: true })];

	it("sorts first and then pulls folders to the front", () => {
		expect(
			applySort(items, { orderBy: "name", orderDirection: "asc", extractFolder: "front" }).map((entry) => entry.name),
		).toEqual(["dirA", "dirB", "a.txt", "b.txt"]);
	});

	it("keeps a descending sort when pulling folders to the back", () => {
		expect(
			applySort(items, { orderBy: "name", orderDirection: "desc", extractFolder: "back" }).map((entry) => entry.name),
		).toEqual(["b.txt", "a.txt", "dirB", "dirA"]);
	});
});

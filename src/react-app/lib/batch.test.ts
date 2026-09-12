import { beforeEach, describe, expect, it } from "vitest";
import { collectRemovals, groupByParent, summarizeBatch } from "./batch";
import { setLocale } from "./locale";
import { rangePaths } from "../hooks/useSelection";
import type { FileItem } from "./types";

/** See the note in `transfer.test.ts`: the wording is English on purpose. */
beforeEach(() => {
	setLocale("en");
});

function item(name: string, path: string): FileItem {
	return { name, path, size: 0, is_dir: false, modified: "" };
}

describe("groupByParent", () => {
	it("splits a search result set by directory", () => {
		const groups = groupByParent([item("a.txt", "/docs/a.txt"), item("b.txt", "/docs/b.txt"), item("c.txt", "/c.txt")]);
		expect([...groups]).toEqual([
			["/docs", ["a.txt", "b.txt"]],
			["/", ["c.txt"]],
		]);
	});

	it("treats a top-level entry as living in the root", () => {
		expect([...groupByParent([item("readme.md", "/readme.md")])]).toEqual([["/", ["readme.md"]]]);
	});
});

describe("collectRemovals", () => {
	it("counts successes and keeps per-name failures", () => {
		const settled: PromiseSettledResult<{ removed?: string[]; failed?: { name: string; error: string }[] }>[] = [
			{ status: "fulfilled", value: { removed: ["a"], failed: [{ name: "b", error: "denied" }] } },
			{ status: "rejected", reason: new Error("network") },
		];
		const result = collectRemovals(settled);
		expect(result.done).toBe(1);
		expect(result.failed).toEqual([
			{ name: "b", error: "denied" },
			{ name: "?", error: "network" },
		]);
	});
});

describe("summarizeBatch", () => {
	it("reports a clean run", () => {
		expect(summarizeBatch({ done: 2, failed: [] })).toEqual({ message: "2 items deleted", error: false });
	});

	it("singularises a single entry", () => {
		expect(summarizeBatch({ done: 1, failed: [] })).toEqual({ message: "1 item deleted", error: false });
	});

	it("surfaces the first failure when nothing succeeded", () => {
		expect(summarizeBatch({ done: 0, failed: [{ name: "a", error: "denied" }] })).toEqual({
			message: "denied",
			error: true,
		});
	});

	it("reports both halves of a partial run", () => {
		expect(summarizeBatch({ done: 3, failed: [{ name: "d", error: "denied" }] })).toEqual({
			message: "3 items deleted, 1 failed: denied",
			error: true,
		});
	});
});

describe("rangePaths", () => {
	const visible = [item("a", "/a"), item("b", "/b"), item("c", "/c"), item("d", "/d")];

	it("walks forward from the anchor", () => {
		expect(rangePaths(visible, 1, 3)).toEqual(["/b", "/c", "/d"]);
	});

	it("walks backward from the anchor", () => {
		expect(rangePaths(visible, 3, 1)).toEqual(["/b", "/c", "/d"]);
	});

	it("returns a single path when the anchor is the target", () => {
		expect(rangePaths(visible, 2, 2)).toEqual(["/c"]);
	});
});

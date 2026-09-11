import { describe, expect, it } from "vitest";
import { crumbsOf, normalizeInputPath, parentOf } from "./paths";

describe("parentOf", () => {
	it("returns the directory that holds a path", () => {
		expect(parentOf("/a/b/c.txt")).toBe("/a/b");
	});

	it("treats the root as its own parent", () => {
		expect(parentOf("/a")).toBe("/");
		expect(parentOf("/")).toBe("/");
	});
});

describe("crumbsOf", () => {
	it("builds one cumulative crumb per segment", () => {
		expect(crumbsOf("/a/b/c")).toEqual([
			{ name: "a", path: "/a" },
			{ name: "b", path: "/a/b" },
			{ name: "c", path: "/a/b/c" },
		]);
	});

	it("has no crumbs at the root", () => {
		expect(crumbsOf("/")).toEqual([]);
	});
});

describe("normalizeInputPath", () => {
	it("adds the leading slash a typed path usually misses", () => {
		expect(normalizeInputPath("waynecos/docs")).toBe("/waynecos/docs");
	});

	it("drops a trailing slash", () => {
		expect(normalizeInputPath("/waynecos/docs/")).toBe("/waynecos/docs");
	});

	it("collapses repeated separators", () => {
		expect(normalizeInputPath("//waynecos///docs")).toBe("/waynecos/docs");
	});

	it("trims surrounding whitespace", () => {
		expect(normalizeInputPath("  /waynecos  ")).toBe("/waynecos");
	});

	it("resolves the lexical segments a text field can be expected to know", () => {
		expect(normalizeInputPath("/a/b/../c")).toBe("/a/c");
		expect(normalizeInputPath("/a/./b")).toBe("/a/b");
	});

	it("does not walk above the root", () => {
		expect(normalizeInputPath("/../..")).toBe("/");
		expect(normalizeInputPath("a/../..")).toBe("/");
	});

	it("treats an empty or separator-only entry as the root", () => {
		expect(normalizeInputPath("")).toBe("/");
		expect(normalizeInputPath("   ")).toBe("/");
		expect(normalizeInputPath("/")).toBe("/");
		expect(normalizeInputPath("///")).toBe("/");
	});

	it("keeps a segment that merely contains dots", () => {
		expect(normalizeInputPath("/a/..b/c")).toBe("/a/..b/c");
	});

	it("leaves non-ascii names alone", () => {
		expect(normalizeInputPath("临时存储/文档")).toBe("/临时存储/文档");
	});
});

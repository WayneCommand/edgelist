import { describe, expect, it } from "vitest";
import { readmeSourceFor, readmeSourceKey, README_FILES } from "./readme";
import type { FileItem } from "./types";

function entry(name: string, isDir = false): FileItem {
	return { name, size: 100, is_dir: isDir, modified: "2026-01-02T03:04:05Z", path: `/waynecos/${name}` };
}

describe("readmeSourceFor", () => {
	it("has nothing to render without a file or a rule", () => {
		expect(readmeSourceFor("readme", [], undefined)).toEqual({ kind: "none" });
	});

	it("treats a blank rule as nothing", () => {
		expect(readmeSourceFor("readme", [], "   \n ")).toEqual({ kind: "none" });
	});

	it("renders a rule's text inline", () => {
		expect(readmeSourceFor("readme", [], "# Welcome")).toEqual({ kind: "inline", text: "# Welcome" });
	});

	it("fetches a rule that is a URL instead of rendering it", () => {
		expect(readmeSourceFor("readme", [], "https://example.com/r.md")).toEqual({
			kind: "remote",
			url: "https://example.com/r.md",
		});
	});

	it("only treats http(s) as remote, not any scheme", () => {
		expect(readmeSourceFor("readme", [], "ftp://example.com/r.md")).toEqual({
			kind: "inline",
			text: "ftp://example.com/r.md",
		});
	});

	it("prefers a file in the directory over the rule", () => {
		const source = readmeSourceFor("readme", [entry("readme.md")], "# from the rule");
		expect(source).toEqual({ kind: "file", path: "/waynecos/readme.md" });
	});

	it("matches the file name case-insensitively", () => {
		expect(readmeSourceFor("readme", [entry("README.MD")], "")).toEqual({
			kind: "file",
			path: "/waynecos/README.MD",
		});
	});

	it("accepts any of the slot's three names", () => {
		expect(README_FILES.header).toEqual(["header.md", "top.md", "index.md"]);
		expect(README_FILES.readme).toEqual(["readme.md", "footer.md", "bottom.md"]);
		for (const name of README_FILES.readme) {
			expect(readmeSourceFor("readme", [entry(name)], "")).toEqual({ kind: "file", path: `/waynecos/${name}` });
		}
	});

	it("does not take a name belonging to the other slot", () => {
		expect(readmeSourceFor("readme", [entry("header.md")], "")).toEqual({ kind: "none" });
		expect(readmeSourceFor("header", [entry("readme.md")], "")).toEqual({ kind: "none" });
	});

	it("ignores a directory that happens to have a matching name", () => {
		expect(readmeSourceFor("readme", [entry("readme.md", true)], "# rule")).toEqual({
			kind: "inline",
			text: "# rule",
		});
	});
});

describe("readmeSourceKey", () => {
	it("distinguishes the kinds so an effect can key off it", () => {
		const keys = [
			readmeSourceKey({ kind: "none" }),
			readmeSourceKey({ kind: "file", path: "/a/readme.md" }),
			readmeSourceKey({ kind: "remote", url: "https://example.com/r.md" }),
			readmeSourceKey({ kind: "inline", text: "# hi" }),
		];
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("is stable for the same source", () => {
		expect(readmeSourceKey({ kind: "inline", text: "# hi" })).toBe(readmeSourceKey({ kind: "inline", text: "# hi" }));
	});
});

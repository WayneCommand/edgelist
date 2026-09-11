import { describe, expect, it } from "vitest";
import { crossStorageHint, mountPathFor, summarizeTransfer } from "./transfer";
import type { TransferResult } from "./types";

describe("mountPathFor", () => {
	it("picks the longest matching mount", () => {
		const mounts = ["/a", "/a/b", "/other"];
		expect(mountPathFor("/a/b/c", mounts)).toBe("/a/b");
		expect(mountPathFor("/a/c", mounts)).toBe("/a");
		expect(mountPathFor("/other", mounts)).toBe("/other");
	});

	it("matches on a separator boundary, not a string prefix", () => {
		expect(mountPathFor("/a-b/c", ["/a"])).toBeNull();
		expect(mountPathFor("/ab", ["/a"])).toBeNull();
	});

	it("ignores trailing slashes on the mount", () => {
		expect(mountPathFor("/docs/x", ["/docs/"])).toBe("/docs");
	});

	it("lets a root mount claim everything", () => {
		expect(mountPathFor("/anything/at/all", ["/"])).toBe("/");
		expect(mountPathFor("/a/b", ["/", "/a"])).toBe("/a");
	});

	it("returns null when nothing serves the path", () => {
		expect(mountPathFor("/nowhere", ["/a", "/b"])).toBeNull();
	});
});

describe("crossStorageHint", () => {
	it("stays quiet within one storage", () => {
		expect(crossStorageHint("/a", "/a")).toBeNull();
	});

	it("names both storages when they differ", () => {
		expect(crossStorageHint("/waynecos", "/jianguoyun")).toContain("/waynecos");
		expect(crossStorageHint("/waynecos", "/jianguoyun")).toContain("/jianguoyun");
	});

	it("stays quiet when a mount cannot be determined", () => {
		// An unknown path is left to the server to judge.
		expect(crossStorageHint(null, "/a")).toBeNull();
		expect(crossStorageHint("/a", null)).toBeNull();
	});
});

describe("summarizeTransfer", () => {
	function result(overrides: Partial<TransferResult> = {}): TransferResult {
		return { operation: "copy", results: [], accepted: 0, skipped: 0, failed: 0, ...overrides };
	}

	it("reports a clean copy", () => {
		expect(summarizeTransfer(result({ accepted: 3 }))).toEqual({ message: "Copied 3 items", error: false });
	});

	it("uses the singular for one item and the right verb for a move", () => {
		expect(summarizeTransfer(result({ accepted: 1 }))).toEqual({ message: "Copied 1 item", error: false });
		expect(summarizeTransfer(result({ operation: "move", accepted: 2 }))).toEqual({
			message: "Moved 2 items",
			error: false,
		});
	});

	it("flags a partial failure", () => {
		expect(summarizeTransfer(result({ accepted: 1, failed: 2 }))).toEqual({
			message: "Copied 1 item, 2 failed",
			error: true,
		});
	});

	it("reports a run that only skipped", () => {
		expect(summarizeTransfer(result({ skipped: 2 }))).toEqual({ message: "2 skipped", error: false });
	});

	it("has something to say when nothing happened", () => {
		expect(summarizeTransfer(result())).toEqual({ message: "Nothing to do", error: false });
	});
});

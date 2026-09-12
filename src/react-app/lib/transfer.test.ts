import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "./locale";
import { crossStorageHint, destinationHint, mountPathFor, summarizeTransfer, unwritableHint } from "./transfer";
import type { TransferResult } from "./types";

/**
 * These assertions are about the English wording, and the translator behind
 * them reads the ambient language — which `lib/locale.ts` takes from the
 * browser, or under Node from `navigator.language`. Pinning it keeps the suite
 * from depending on the machine it runs on.
 */
beforeEach(() => {
	setLocale("en");
});

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

describe("unwritableHint", () => {
	it("stays quiet while the mount list is unknown", () => {
		// A failed read must not lock every write button in the app.
		expect(unwritableHint("/", null)).toBeNull();
		expect(unwritableHint("/waynecos/docs", null)).toBeNull();
	});

	it("stays quiet when a storage serves the path", () => {
		expect(unwritableHint("/waynecos", ["/waynecos"])).toBeNull();
		expect(unwritableHint("/waynecos/docs", ["/waynecos"])).toBeNull();
		expect(unwritableHint("/anything", ["/"])).toBeNull();
	});

	it("reports the root when no storage is mounted there", () => {
		// The root aggregates the mounts beneath it; it is not a storage itself,
		// so `fs/mkdir` at "/" answers "Storage not found".
		expect(unwritableHint("/", ["/waynecos", "/jianguoyun"])).toContain("No storage is mounted at /");
	});

	it("names a level that only exists to reach a nested mount", () => {
		// `/a` is not mounted, so the write fails either way, but "no storage is
		// mounted at /a" contradicts the folder sitting in the listing.
		expect(unwritableHint("/a", ["/a/b"])).toContain("nested mount");
	});

	it("keeps a path writable when a parent storage still serves it", () => {
		// `fsMkdir` resolves `/a` to the root storage and would succeed, so the
		// guard must not refuse what the worker would accept.
		expect(unwritableHint("/a", ["/", "/a/b"])).toBeNull();
	});
});

describe("destinationHint", () => {
	const mounts = ["/waynecos", "/jianguoyun"];

	it("allows a transfer into a sibling folder of the same storage", () => {
		expect(destinationHint("/waynecos/docs", "/waynecos/media", mounts)).toBeNull();
	});

	it("refuses the source folder itself", () => {
		expect(destinationHint("/waynecos", "/waynecos", mounts)).toContain("other than the one");
	});

	it("refuses a folder nested inside the source", () => {
		expect(destinationHint("/waynecos/docs", "/waynecos/docs/sub", mounts)).toContain("inside itself");
		// A trailing slash on the source must not defeat the check.
		expect(destinationHint("/waynecos/docs/", "/waynecos/docs/sub", mounts)).toContain("inside itself");
	});

	it("still allows a sibling whose name starts like the source", () => {
		expect(destinationHint("/a/docs", "/a/docs2", ["/a"])).toBeNull();
	});

	it("refuses a destination in another storage", () => {
		expect(destinationHint("/waynecos", "/jianguoyun", mounts)).toContain("Cross-storage");
	});

	it("refuses a destination no storage serves", () => {
		expect(destinationHint("/waynecos", "/nowhere", mounts)).toContain("No storage is mounted");
	});

	it("leaves the choice to the server while the mount list is unknown", () => {
		// Only the rules that need no mount list survive: same folder and nesting.
		expect(destinationHint("/waynecos", "/jianguoyun", null)).toBeNull();
		expect(destinationHint("/waynecos", "/waynecos", null)).toContain("other than the one");
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

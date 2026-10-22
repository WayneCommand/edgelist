import { describe, expect, it } from "vitest";
import { encodedSharePath, shareFailure, type ShareRecord } from "./share";

/**
 * A share is a record of its own, keyed by a virtual path.
 *
 * The rule that matters most here is the default: a path is *not* public unless a
 * record names it exactly. Getting that wrong publishes a tree, which is the one
 * mistake this feature cannot make.
 */

function share(overrides: Partial<ShareRecord> = {}): ShareRecord {
	return {
		path: "/docs/token.md",
		storage_id: 1,
		storage_name: "/",
		storage_mount: "/",
		...overrides,
	};
}

describe("shareFailure", () => {
	it("treats a missing record as not shared", () => {
		expect(shareFailure(null)).toBe("not_shared");
	});

	it("serves a record that only names its path", () => {
		expect(shareFailure(share())).toBeNull();
	});

	it("reports a disabled share as disabled, not as missing", () => {
		expect(shareFailure(share({ enabled: false }))).toBe("disabled");
	});

	it("treats an absent `enabled` as enabled", () => {
		expect(shareFailure(share({ enabled: undefined }))).toBeNull();
	});

	it("reports an expiry that has passed, and only then", () => {
		const now = Date.parse("2026-01-10T00:00:00Z");
		expect(shareFailure(share({ expires: "2026-01-09T23:59:59Z" }), now)).toBe("expired");
		expect(shareFailure(share({ expires: "2026-01-10T00:00:01Z" }), now)).toBeNull();
	});

	it("treats an unparsable expiry as no expiry", () => {
		// A typo must not silently break a link the owner believes is live.
		expect(shareFailure(share({ expires: "next tuesday" }))).toBeNull();
	});

	it("treats an empty expiry as no expiry", () => {
		expect(shareFailure(share({ expires: "" }))).toBeNull();
	});

	it("reports an exhausted share once the ceiling is reached", () => {
		expect(shareFailure(share({ max_views: 3, views: 2 }))).toBeNull();
		expect(shareFailure(share({ max_views: 3, views: 3 }))).toBe("exhausted");
		expect(shareFailure(share({ max_views: 3, views: 9 }))).toBe("exhausted");
	});

	it("treats a ceiling of zero as unlimited", () => {
		expect(shareFailure(share({ max_views: 0, views: 1000 }))).toBeNull();
		expect(shareFailure(share({ views: 1000 }))).toBeNull();
	});

	it("reports disabled before expired when both apply", () => {
		// The owner switched it off; saying "expired" would be the wrong sentence.
		const record = share({ enabled: false, expires: "2000-01-01T00:00:00Z" });
		expect(shareFailure(record)).toBe("disabled");
	});
});

describe("encodedSharePath", () => {
	it("keeps a root-level file as one segment", () => {
		expect(encodedSharePath("/token.md")).toBe("token.md");
	});

	it("keeps a nested path's slashes", () => {
		expect(encodedSharePath("/waynecos/token.md")).toBe("waynecos/token.md");
	});

	it("encodes one segment at a time", () => {
		expect(encodedSharePath("/a folder/中文 名.md")).toBe("a%20folder/%E4%B8%AD%E6%96%87%20%E5%90%8D.md");
	});

	it("normalizes a trailing slash so one file has one address", () => {
		expect(encodedSharePath("/waynecos/token.md/")).toBe("waynecos/token.md");
	});
});

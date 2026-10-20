import { describe, expect, it } from "vitest";
import { isShared, randomShareId, shareFailure, shareIdOf, type MetaConfig } from "./meta";

/**
 * A share is a metadata rule with `share: true`.
 *
 * The rule that matters most here is the default: a file is *not* public unless a
 * record says so, and the default has to survive every absence — no record, no
 * `share` field, a record for a parent directory. Getting that wrong publishes a
 * tree, which is the one mistake this feature cannot make.
 */

function share(overrides: Partial<MetaConfig> = {}): MetaConfig {
	return { id: 1, path: "/docs/token.md", share: true, ...overrides };
}

describe("shareFailure", () => {
	it("treats a missing record as not shared", () => {
		expect(shareFailure(null)).toBe("not_shared");
	});

	it("treats a record without the flag as not shared", () => {
		// The common case: most rules are passwords, hide patterns or readmes.
		expect(shareFailure({ id: 1, path: "/docs" })).toBe("not_shared");
		expect(shareFailure({ id: 1, path: "/docs", share: false })).toBe("not_shared");
	});

	it("serves a share that only says `true`", () => {
		expect(shareFailure(share())).toBeNull();
		expect(isShared(share())).toBe(true);
	});

	it("reports a disabled share as disabled, not as missing", () => {
		expect(shareFailure(share({ share_enabled: false }))).toBe("disabled");
	});

	it("treats an absent `share_enabled` as enabled", () => {
		// Records written before the field existed must not read as switched off.
		expect(shareFailure(share({ share_enabled: undefined }))).toBeNull();
	});

	it("reports an expiry that has passed, and only then", () => {
		const now = Date.parse("2026-01-10T00:00:00Z");
		expect(shareFailure(share({ share_expires: "2026-01-09T23:59:59Z" }), now)).toBe("expired");
		expect(shareFailure(share({ share_expires: "2026-01-10T00:00:01Z" }), now)).toBeNull();
	});

	it("treats an unparsable expiry as no expiry", () => {
		// A typo must not silently break a link the owner believes is live.
		expect(shareFailure(share({ share_expires: "next tuesday" }))).toBeNull();
	});

	it("treats an empty expiry as no expiry", () => {
		expect(shareFailure(share({ share_expires: "" }))).toBeNull();
	});

	it("reports an exhausted share once the ceiling is reached", () => {
		expect(shareFailure(share({ share_max_views: 3, share_views: 2 }))).toBeNull();
		expect(shareFailure(share({ share_max_views: 3, share_views: 3 }))).toBe("exhausted");
		expect(shareFailure(share({ share_max_views: 3, share_views: 9 }))).toBe("exhausted");
	});

	it("treats a ceiling of zero as unlimited", () => {
		expect(shareFailure(share({ share_max_views: 0, share_views: 1000 }))).toBeNull();
		expect(shareFailure(share({ share_views: 1000 }))).toBeNull();
	});

	it("reports disabled before expired when both apply", () => {
		// The owner switched it off; saying "expired" would be the wrong sentence.
		const meta = share({ share_enabled: false, share_expires: "2000-01-01T00:00:00Z" });
		expect(shareFailure(meta)).toBe("disabled");
	});
});

describe("shareIdOf", () => {
	it("uses the file name when no custom id is set", () => {
		expect(shareIdOf(share())).toBe("token.md");
	});

	it("prefers a custom id", () => {
		expect(shareIdOf(share({ share_id: "abc123" }))).toBe("abc123");
	});

	it("ignores a blank custom id rather than serving an empty URL segment", () => {
		expect(shareIdOf(share({ share_id: "   " }))).toBe("token.md");
	});

	it("handles a file at the root", () => {
		expect(shareIdOf(share({ path: "/readme.md" }))).toBe("readme.md");
	});
});

describe("randomShareId", () => {
	it("produces an id of the requested length from the safe alphabet", () => {
		const id = randomShareId();
		expect(id).toHaveLength(8);
		// No `0`, `1`, `l`, `i` or `o`: a share id gets typed out of a chat window.
		expect(id).toMatch(/^[2-9a-hjkmnp-z]+$/);
	});

	it("does not repeat across calls", () => {
		const ids = new Set(Array.from({ length: 50 }, () => randomShareId()));
		expect(ids.size).toBe(50);
	});
});

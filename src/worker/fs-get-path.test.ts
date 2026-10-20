import { describe, expect, it } from "vitest";
import { publicFilePath, virtualPathFor } from "./fs";

/**
 * `fs/get` must answer with the *virtual* path, not the mount-relative one.
 *
 * This is the bug behind "download is broken": the S3 adapter looks a key up
 * relative to the mount, so a file at `/waynecos/token.md` comes back with
 * `name: "/token.md"`. The file page used that answer to build its download URL,
 * produced `/d/token.md`, and got a 404 — while the file page itself looked
 * perfectly healthy, because everything it rendered came from the request.
 */

describe("virtualPathFor", () => {
	it("keeps the mount prefix the adapter dropped", () => {
		const result = virtualPathFor("/waynecos/token.md", "/token.md");
		expect(result.path).toBe("/waynecos/token.md");
		expect(result.name).toBe("token.md");
	});

	it("does not double the last segment", () => {
		// Prefixing the *requested* path to the adapter's full path produced
		// "/waynecos/token.md/token.md" — the second way this went wrong.
		const result = virtualPathFor("/waynecos/token.md", "token.md");
		expect(result.path).toBe("/waynecos/token.md");
	});

	it("handles a file at the root of a root mount", () => {
		const result = virtualPathFor("/token.md", "/token.md");
		expect(result.path).toBe("/token.md");
		expect(result.name).toBe("token.md");
	});

	it("handles a file several levels down", () => {
		const result = virtualPathFor("/mount/a/b/c.txt", "/a/b/c.txt");
		expect(result.path).toBe("/mount/a/b/c.txt");
		expect(result.name).toBe("c.txt");
	});

	it("agrees with publicFilePath on how a path is built", () => {
		// The two are the same rule seen from different directions; if one changes
		// the other has to follow.
		expect(virtualPathFor("/mount/x.bin", "/x.bin").path).toBe(publicFilePath("/mount", "x.bin"));
	});
});

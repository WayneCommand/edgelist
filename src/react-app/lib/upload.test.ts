import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import type { DriverInfo } from "./drivers";
import { setLocale } from "./locale";
import type { Storage } from "./types";
import {
	SINGLE_UPLOAD_LIMIT,
	ceilingHint,
	ceilingReason,
	chunkRanges,
	chunkableMounts,
	progressPercent,
	uploadFile,
	uploadInChunks,
	uploadPlanFor,
	type ChunkTransport,
} from "./upload";

const MIB = 1024 * 1024;
/** A retry policy that does not make a test wait out the backoff. */
const instantRetry = { delays: [0, 0], sleep: async () => undefined };

/** See the note in `transfer.test.ts`: the wording is English on purpose. */
beforeEach(() => {
	setLocale("en");
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function storage(mount_path: string, driver: string): Storage {
	return { id: 1, mount_path, driver: driver as Storage["driver"], addition: "{}", remark: "" };
}

function driver(key: string, capabilities?: string[]): DriverInfo {
	return { key, name: key, common: [], additional: [], capabilities };
}

function blobOf(bytes: readonly number[]): Blob {
	return new Blob([new Uint8Array(bytes)]);
}

type ChunkCall = { index: number; bytes: number[] };

function fakeTransport(
	options: {
		chunkSize?: number;
		failChunk?: number;
		failInit?: boolean;
		failComplete?: boolean;
		/** Fails the first time this chunk is sent, then accepts it. */
		failOnceChunk?: number;
		/** Fails every attempt at this chunk, with a status worth retrying. */
		failTransientChunk?: number;
	} = {},
) {
	const calls: {
		init: Array<{ path: string; size: number }>;
		chunk: ChunkCall[];
		complete: string[];
		abort: string[];
	} = { init: [], chunk: [], complete: [], abort: [] };
	let failedOnce = false;
	const transport: ChunkTransport = {
		async init(path, size) {
			if (options.failInit) throw new Error("init failed");
			calls.init.push({ path, size });
			return { uploadId: "session-1", chunkSize: options.chunkSize ?? 4 };
		},
		async chunk(_uploadId, index, body) {
			const bytes = [...new Uint8Array(await body.arrayBuffer())];
			if (options.failOnceChunk === index && !failedOnce) {
				failedOnce = true;
				throw new ApiError("bad gateway", 502);
			}
			if (options.failTransientChunk === index) throw new ApiError("bad gateway", 502);
			if (options.failChunk === index) throw new Error(`chunk ${index} failed`);
			calls.chunk.push({ index, bytes });
		},
		async complete(uploadId) {
			if (options.failComplete) throw new Error("complete failed");
			calls.complete.push(uploadId);
		},
		async abort(uploadId) {
			calls.abort.push(uploadId);
		},
	};
	return { calls, transport };
}

describe("uploadPlanFor", () => {
	it("sends anything at or under the ceiling in one request", () => {
		expect(uploadPlanFor(1, null)).toEqual({ transport: "single" });
		expect(uploadPlanFor(SINGLE_UPLOAD_LIMIT, null)).toEqual({ transport: "single" });
		// The ceiling itself is allowed: the limit is a maximum, not an exclusive
		// bound, so a file exactly that size is not pushed into the slow path.
		expect(uploadPlanFor(SINGLE_UPLOAD_LIMIT, false)).toEqual({ transport: "single" });
	});

	it("splits a file past the ceiling when the storage can reassemble it", () => {
		expect(uploadPlanFor(SINGLE_UPLOAD_LIMIT + 1, true)).toEqual({ transport: "chunked" });
	});

	it("tries a split when the capability is unknown rather than refusing", () => {
		// `null` is "we have not loaded the driver list", not "no". Guessing no
		// would refuse an upload that would have worked; guessing yes costs one
		// request that the worker answers with a clear refusal.
		expect(uploadPlanFor(SINGLE_UPLOAD_LIMIT + 1, null)).toEqual({ transport: "chunked" });
	});

	it("refuses a file past the ceiling when the storage cannot split it", () => {
		expect(uploadPlanFor(SINGLE_UPLOAD_LIMIT + 1, false)).toEqual({ transport: "refused" });
	});
});

describe("ceilingReason", () => {
	it("names the file, its size and the ceiling", () => {
		const reason = ceilingReason("dump.iso", 240 * MIB);
		expect(reason).toContain("dump.iso");
		expect(reason).toContain("240.0 MB");
		expect(reason).toContain("100 MB");
		expect(reason).toContain("cannot accept a split upload");
	});
});

describe("ceilingHint", () => {
	it("states the ceiling where the storage cannot split an upload", () => {
		const hint = ceilingHint(false);
		expect(hint).toContain("100 MB per file");
		expect(hint).toContain("cannot accept a split upload");
	});

	it("says nothing where the note would not apply", () => {
		// A capable storage has no ceiling worth mentioning, and an unknown one
		// may well be capable — warning about a limit that turns out not to exist
		// teaches the user to distrust the warnings that are real.
		expect(ceilingHint(true)).toBeNull();
		expect(ceilingHint(null)).toBeNull();
	});
});

describe("chunkRanges", () => {
	it("cuts a file into chunks with a short last one", () => {
		expect(chunkRanges(10, 4)).toEqual([
			{ index: 0, start: 0, end: 4 },
			{ index: 1, start: 4, end: 8 },
			{ index: 2, start: 8, end: 10 },
		]);
	});

	it("does not add an empty trailing chunk when the size divides evenly", () => {
		expect(chunkRanges(8, 4)).toEqual([
			{ index: 0, start: 0, end: 4 },
			{ index: 1, start: 4, end: 8 },
		]);
	});

	it("keeps the count the server checks the assembled parts against", () => {
		// The worker computes `Math.ceil(size / chunk_size)` and refuses anything
		// else as incomplete, so the two have to agree exactly.
		for (const size of [1, 5, 8, 9, 20 * MIB, 20 * MIB + 1]) {
			expect(chunkRanges(size, 8 * MIB).length).toBe(Math.ceil(size / (8 * MIB)));
		}
	});

	it("covers the file end to end with no gaps or overlap", () => {
		const ranges = chunkRanges(1000, 7);
		let cursor = 0;
		for (const range of ranges) {
			expect(range.start).toBe(cursor);
			expect(range.end).toBeGreaterThan(range.start);
			cursor = range.end;
		}
		expect(cursor).toBe(1000);
	});

	it("returns nothing for a size or chunk size that cannot describe a file", () => {
		expect(chunkRanges(0, 4)).toEqual([]);
		expect(chunkRanges(-1, 4)).toEqual([]);
		expect(chunkRanges(Number.NaN, 4)).toEqual([]);
		expect(chunkRanges(10, 0)).toEqual([]);
		expect(chunkRanges(10, -4)).toEqual([]);
		expect(chunkRanges(10, Number.NaN)).toEqual([]);
	});
});

describe("progressPercent", () => {
	it("reports the fraction sent, rounded", () => {
		expect(progressPercent(0, 200)).toBe(0);
		expect(progressPercent(50, 200)).toBe(25);
		expect(progressPercent(200, 200)).toBe(100);
	});

	it("clamps rather than reporting a nonsense percentage", () => {
		expect(progressPercent(-10, 200)).toBe(0);
		expect(progressPercent(400, 200)).toBe(100);
		expect(progressPercent(10, 0)).toBe(0);
	});
});

describe("chunkableMounts", () => {
	it("keeps only the mounts whose driver declares multipart", () => {
		const mounts = chunkableMounts(
			[storage("/waynecos", "object"), storage("/dav", "webdav"), storage("/proxy", "openlist")],
			[driver("object", ["read", "write", "multipart"]), driver("webdav", ["read", "write"]), driver("openlist", [])],
		);
		expect(mounts).toEqual(["/waynecos"]);
	});

	it("spells a mount the way the path matcher compares it", () => {
		// A mount written with a trailing slash has to come out the same shape as
		// `mountPathFor` produces, or a match there would miss here.
		const mounts = chunkableMounts(
			[storage("/waynecos/", "object"), storage("/", "object")],
			[driver("object", ["multipart"])],
		);
		expect(mounts).toEqual(["/waynecos", "/"]);
	});

	it("matches the driver key without caring about case", () => {
		const mounts = chunkableMounts([storage("/a", "OBJECT")], [driver("object", ["multipart"])]);
		expect(mounts).toEqual(["/a"]);
	});

	it("treats a driver with no published capabilities as having none", () => {
		// An older worker sends no list at all; that must read as "cannot split",
		// which is the conservative answer for a capability nobody declared.
		expect(chunkableMounts([storage("/a", "object")], [driver("object")])).toEqual([]);
		expect(chunkableMounts([storage("/a", "object")], [])).toEqual([]);
	});
});

describe("uploadInChunks", () => {
	it("opens a session, sends every chunk in order, then assembles", async () => {
		const { calls, transport } = fakeTransport({ chunkSize: 4 });
		await uploadInChunks(blobOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), "/waynecos/dump.bin", transport);

		expect(calls.init).toEqual([{ path: "/waynecos/dump.bin", size: 10 }]);
		expect(calls.chunk).toEqual([
			{ index: 0, bytes: [0, 1, 2, 3] },
			{ index: 1, bytes: [4, 5, 6, 7] },
			{ index: 2, bytes: [8, 9] },
		]);
		expect(calls.complete).toEqual(["session-1"]);
		expect(calls.abort).toEqual([]);
	});

	it("takes the chunk size from the session, not from a constant here", async () => {
		const { calls, transport } = fakeTransport({ chunkSize: 3 });
		await uploadInChunks(blobOf([0, 1, 2, 3, 4, 5, 6]), "/a", transport);
		expect(calls.chunk.map((call) => call.index)).toEqual([0, 1, 2]);
		expect(calls.chunk.map((call) => call.bytes.length)).toEqual([3, 3, 1]);
	});

	it("reports progress cumulatively up to the file size", async () => {
		const { transport } = fakeTransport({ chunkSize: 4 });
		const seen: Array<[number, number]> = [];
		await uploadInChunks(blobOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), "/a", transport, {
			onProgress: (sent, total) => seen.push([sent, total]),
		});
		expect(seen).toEqual([
			[4, 10],
			[8, 10],
			[10, 10],
		]);
	});

	it("releases the session and rethrows when a chunk fails", async () => {
		const { calls, transport } = fakeTransport({ chunkSize: 4, failChunk: 1 });
		await expect(uploadInChunks(blobOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), "/a", transport)).rejects.toThrow(
			"chunk 1 failed",
		);

		// The parts the provider is holding have no other way to be released: a
		// Worker has no background job to reap an abandoned upload.
		expect(calls.abort).toEqual(["session-1"]);
		expect(calls.complete).toEqual([]);
	});

	it("releases the session and rethrows when assembly fails", async () => {
		const { calls, transport } = fakeTransport({ chunkSize: 4, failComplete: true });
		await expect(uploadInChunks(blobOf([0, 1, 2, 3]), "/a", transport)).rejects.toThrow("complete failed");
		expect(calls.abort).toEqual(["session-1"]);
	});

	it("has nothing to release when the session never opened", async () => {
		const { calls, transport } = fakeTransport({ failInit: true });
		await expect(uploadInChunks(blobOf([0, 1, 2, 3]), "/a", transport)).rejects.toThrow("init failed");
		// Aborting an upload that was never started would be a request against a
		// session id that does not exist.
		expect(calls.abort).toEqual([]);
	});

	it("refuses a file with no bytes and releases the session", async () => {
		const { calls, transport } = fakeTransport();
		await expect(uploadInChunks(blobOf([]), "/a", transport)).rejects.toThrow("positive file size");
		expect(calls.chunk).toEqual([]);
		expect(calls.abort).toEqual(["session-1"]);
	});

	it("retries a chunk that failed transiently, and only that chunk", async () => {
		const { calls, transport } = fakeTransport({ chunkSize: 4, failOnceChunk: 1 });
		await uploadInChunks(blobOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), "/a", transport, { retry: instantRetry });

		// The part number is what makes this safe: the server replaces a part by
		// number rather than adding one, so a retry cannot leave a duplicate.
		expect(calls.chunk).toEqual([
			{ index: 0, bytes: [0, 1, 2, 3] },
			{ index: 1, bytes: [4, 5, 6, 7] },
			{ index: 2, bytes: [8, 9] },
		]);
		expect(calls.complete).toEqual(["session-1"]);
		expect(calls.abort).toEqual([]);
	});

	it("gives up and releases the session once a chunk's retries are used up", async () => {
		const { calls, transport } = fakeTransport({ chunkSize: 4, failTransientChunk: 0 });
		// One retry, so the second failure of the same chunk ends the upload — and
		// the session still has to be released, or the parts the provider took for
		// the first attempt would sit there until they expire.
		await expect(
			uploadInChunks(blobOf([0, 1, 2, 3, 4, 5, 6, 7]), "/a", transport, {
				retry: { delays: [0], sleep: async () => undefined },
			}),
		).rejects.toThrow("bad gateway");
		expect(calls.chunk).toEqual([]);
		expect(calls.complete).toEqual([]);
		expect(calls.abort).toEqual(["session-1"]);
	});

	it("does not retry a chunk the server refused", async () => {
		const { calls, transport } = fakeTransport({ chunkSize: 4, failChunk: 0 });
		await expect(
			uploadInChunks(blobOf([0, 1, 2, 3, 4, 5, 6, 7]), "/a", transport, { retry: instantRetry }),
		).rejects.toThrow("chunk 0 failed");
		// A refusal is a decision about this request: asking again would get the
		// same answer and re-send the bytes for nothing.
		expect(calls.abort).toEqual(["session-1"]);
	});
});

describe("uploadFile", () => {
	function respondWith(...statuses: number[]) {
		const attempts: Array<{ url: string; init: RequestInit }> = [];
		let call = 0;
		vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
			attempts.push({ url, init });
			const status = statuses[Math.min(call, statuses.length - 1)];
			call += 1;
			if (status !== 200) return new Response("{}", { status });
			return Response.json({ code: 200, message: "success", data: null });
		});
		return { attempts, count: () => call };
	}

	it("sends one request for a file under the ceiling", async () => {
		const server = respondWith(200);
		await uploadFile("/waynecos/a.bin", blobOf([1, 2, 3]), "application/octet-stream", instantRetry);

		expect(server.count()).toBe(1);
		expect(server.attempts[0].url).toBe("/api/fs/put");
		expect(new Headers(server.attempts[0].init.headers).get("File-Path")).toBe("%2Fwaynecos%2Fa.bin");
		expect(server.attempts[0].init.body).toBeInstanceOf(Blob);
	});

	it("tries again when the server was briefly unavailable", async () => {
		const server = respondWith(502, 200);
		await uploadFile("/waynecos/a.bin", blobOf([1, 2, 3]), "application/octet-stream", instantRetry);
		expect(server.count()).toBe(2);
	});

	it("does not try again when the server refused the request", async () => {
		const server = respondWith(403);
		await expect(
			uploadFile("/waynecos/a.bin", blobOf([1, 2, 3]), "application/octet-stream", instantRetry),
		).rejects.toThrow("Request failed (403)");
		expect(server.count()).toBe(1);
	});
});

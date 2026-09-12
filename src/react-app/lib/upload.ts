import { api } from "./api";
import type { DriverInfo } from "./drivers";
import { formatSize } from "./format";
import { withRetry, type RetryOptions } from "./retry";
import { normalizeMountPath } from "./transfer";
import type { Storage } from "./types";

/**
 * How a file gets to the server.
 *
 * A Worker request cannot carry an unbounded body, so a large file cannot go up
 * in one `PUT /api/fs/put`. Object storage can be told to accept a file in parts
 * and reassemble them (`POST /api/fs/multipart/init` and friends), and that is
 * the only way past the ceiling. WebDAV and a proxied OpenList have no
 * server-side assembly to call, so for them the ceiling is final and the honest
 * answer is to refuse before the bytes move rather than to send 300 MB into a
 * request that will be rejected.
 *
 * This module holds the decisions as plain functions and the upload loop as a
 * loop over an injected transport, so the routing rules and the retry behaviour
 * are testable without a browser or a server.
 */

/**
 * The largest body a single request can carry.
 *
 * Cloudflare enforces this per account plan — 100 MB on Free and Pro, 200 MB on
 * Business, up to 5 GB on Enterprise — and a request over the limit is rejected
 * at the edge with a 413 before any Worker code runs, so the server cannot
 * answer with a friendlier message and the client cannot ask which plan it is
 * on. 100 MB is therefore the only defensible number: it is the documented
 * floor, and a Business or Enterprise deployment simply switches to a split
 * upload a little earlier than it strictly had to, which costs a few extra
 * round trips and nothing else.
 */
export const SINGLE_UPLOAD_LIMIT = 100 * 1024 * 1024;

/** The ceiling as the text messages quote it, derived so the two cannot drift. */
export const SINGLE_UPLOAD_LABEL = `${SINGLE_UPLOAD_LIMIT / (1024 * 1024)} MB`;

export type UploadPlan =
	| { transport: "single" }
	| { transport: "chunked" }
	/** The file is too large and nothing can split it, so it cannot be sent. */
	| { transport: "refused" };

/**
 * Which way a file of `size` should go.
 *
 * `chunkable` is three-valued on purpose. `true` and `false` are answers;
 * `null` means the client does not know — the storage list or the driver list
 * has not loaded — and an unknown answer stays permissive for the same reason
 * `unwritableHint` does: guessing "cannot" would refuse an upload that would
 * have worked, whereas guessing "can" costs one request that the worker
 * answers with a clear refusal, and a file past the ceiling has nowhere else
 * to go anyway.
 */
export function uploadPlanFor(size: number, chunkable: boolean | null): UploadPlan {
	if (size <= SINGLE_UPLOAD_LIMIT) return { transport: "single" };
	if (chunkable === false) return { transport: "refused" };
	return { transport: "chunked" };
}

/** Why a file past the ceiling cannot be uploaded to this storage. */
export function ceilingReason(name: string, size: number): string {
	return `${name} is ${formatSize(size)}; this storage cannot accept a split upload, and one request carries at most ${SINGLE_UPLOAD_LABEL}`;
}

/**
 * What to say about the ceiling in a directory whose storage cannot split an
 * upload, or `null` where the note would not apply.
 *
 * Only a definite "cannot" earns a note. A capable storage has no ceiling worth
 * mentioning, and an unknown one may well be capable — a warning about a limit
 * that turns out not to exist is worse than saying nothing, because it teaches
 * the user to distrust the ones that are real.
 */
export function ceilingHint(chunkable: boolean | null): string | null {
	if (chunkable !== false) return null;
	return `This storage cannot accept a split upload — ${SINGLE_UPLOAD_LABEL} per file`;
}

/**
 * The mounts whose driver can reassemble a split upload.
 *
 * Derived from the same driver registry the worker resolves against, so the
 * answer cannot drift from what the server would do: a driver declares
 * `multipart` because its adapter implements the four methods, and a storage
 * inherits the answer from its driver.
 */
export function chunkableMounts(storages: readonly Storage[], drivers: readonly DriverInfo[]): string[] {
	const capable = new Set(
		drivers
			.filter((driver) => (driver.capabilities ?? []).includes("multipart"))
			.map((driver) => driver.key.toLowerCase()),
	);
	const mounts: string[] = [];
	for (const storage of storages) {
		if (typeof storage.mount_path !== "string" || typeof storage.driver !== "string") continue;
		if (!capable.has(String(storage.driver).toLowerCase())) continue;
		mounts.push(normalizeMountPath(storage.mount_path));
	}
	return mounts;
}

export type ChunkRange = { index: number; start: number; end: number };

/**
 * The slices a file is cut into, in the order the server must receive them.
 *
 * The count has to match the server's own `Math.ceil(size / chunk_size)`, which
 * is what it checks the assembled parts against — an off-by-one here would be
 * refused as an incomplete upload rather than silently truncated, but it would
 * still be a failed upload of a file that was already sent.
 */
export function chunkRanges(size: number, chunkSize: number): ChunkRange[] {
	if (!Number.isFinite(size) || size <= 0) return [];
	if (!Number.isFinite(chunkSize) || chunkSize <= 0) return [];
	const ranges: ChunkRange[] = [];
	for (let start = 0, index = 0; start < size; start += chunkSize, index += 1) {
		ranges.push({ index, start, end: Math.min(start + chunkSize, size) });
	}
	return ranges;
}

/** How far through its chunks a file is, 0–100, safe when the size is unknown. */
export function progressPercent(sent: number, total: number): number {
	if (!Number.isFinite(total) || total <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((sent / total) * 100)));
}

export type ChunkSession = { uploadId: string; chunkSize: number };

/**
 * The five endpoints as the loop needs them.
 *
 * Injected rather than called directly so the loop can be exercised against a
 * fake that fails on demand, and so the retry policy can be tested without a
 * server. The real implementation is `workerTransport`.
 */
export type ChunkTransport = {
	init(targetPath: string, size: number): Promise<ChunkSession>;
	chunk(uploadId: string, index: number, body: Blob): Promise<void>;
	complete(uploadId: string): Promise<void>;
	abort(uploadId: string): Promise<void>;
};

export type UploadOptions = {
	/** Bytes accepted so far, for a progress readout that moves during a file. */
	onProgress?: (sent: number, total: number) => void;
	/** Retry policy for each chunk, replacing the default backoff. */
	retry?: RetryOptions;
};

/**
 * What a batch's progress readout shows.
 *
 * `done`/`total` count files, which is the only thing that can be said while a
 * set of files goes up one at a time. `bytes` is the exception: a file being
 * sent in parts can take minutes on its own, and a counter stuck at "2 of 5"
 * for that long reads as a hang, so the part currently in flight reports its
 * own progress.
 */
export type UploadProgress = {
	done: number;
	total: number;
	bytes?: { sent: number; total: number };
};

/**
 * Send one file in parts: open a session, push each chunk in order, assemble.
 *
 * Chunks go up **one at a time** because the session lives in KV and is read,
 * changed and written back on every chunk — two in flight would race and the
 * loser's part number would be dropped from the record even though the provider
 * kept the part.
 *
 * Any failure aborts the session. The parts the provider is holding have no
 * other way to be released: a Worker has no background job to reap an abandoned
 * upload, so leaving the session open would leave the parts behind until they
 * expire. Aborting is best effort — the session may already be gone — and the
 * original error is what the caller sees either way.
 *
 * The chunk size is whatever `init` answers with, not a constant here: the
 * server owns the floor (S3 refuses a part below 5 MiB) and the default, and a
 * second copy of that number on this side would be a copy that could drift.
 *
 * Each chunk is retried on its own, because a chunk is the one step here that is
 * safe to repeat — see the note in the loop. `init` and `complete` are not: a
 * second `init` would leave a session behind, and a second `complete` would
 * find the first one already gone.
 */
export async function uploadInChunks(
	file: Blob,
	targetPath: string,
	transport: ChunkTransport,
	options: UploadOptions = {},
): Promise<void> {
	const session = await transport.init(targetPath, file.size);
	const ranges = chunkRanges(file.size, session.chunkSize);
	if (!ranges.length) {
		await transport.abort(session.uploadId).catch(() => undefined);
		throw new Error("A split upload needs a positive file size");
	}
	try {
		let sent = 0;
		for (const range of ranges) {
			await withRetry(
				() => transport.chunk(session.uploadId, range.index, file.slice(range.start, range.end)),
				options.retry,
			);
			sent += range.end - range.start;
			options.onProgress?.(sent, file.size);
		}
		await transport.complete(session.uploadId);
	} catch (error) {
		await transport.abort(session.uploadId).catch(() => undefined);
		throw error;
	}
}

/**
 * Send one file in a single request, for anything at or under the ceiling.
 *
 * Retried, because a large body is the likeliest thing in this app to meet a
 * dropped connection, and a `PUT` to a path is idempotent: the same bytes land
 * in the same place, so a second attempt cannot duplicate anything. The cost of
 * being wrong is re-sending the body, which is still better than losing it.
 *
 * `retry` is the same policy hook the split path takes, for a caller that wants
 * a longer wait than the default — a single request carries the whole file, so
 * its backoff is the one that may want tuning against a slow backend.
 */
export async function uploadFile(
	destination: string,
	file: Blob,
	contentType: string,
	retry: RetryOptions = {},
): Promise<void> {
	await withRetry(
		() =>
			api<null>("/api/fs/put", {
				method: "PUT",
				headers: {
					"File-Path": encodeURIComponent(destination),
					"Content-Type": contentType || "application/octet-stream",
				},
				body: file,
			}),
		retry,
	);
}

/** The endpoints, over the authenticated API client. */
export function workerTransport(): ChunkTransport {
	return {
		async init(targetPath, size) {
			const data = await api<{ upload_id: string; chunk_size: number }>("/api/fs/multipart/init", {
				method: "POST",
				body: JSON.stringify({ path: targetPath, size }),
			});
			return { uploadId: data.upload_id, chunkSize: data.chunk_size };
		},
		async chunk(uploadId, index, body) {
			await api<null>("/api/fs/multipart/chunk", {
				method: "PUT",
				headers: {
					// Named explicitly: the API client infers JSON from the presence of
					// a body, and these bytes are opaque.
					"Content-Type": "application/octet-stream",
					"X-Upload-Id": uploadId,
					"X-Chunk-Index": String(index),
				},
				body,
			});
		},
		async complete(uploadId) {
			await api<null>("/api/fs/multipart/complete", {
				method: "POST",
				body: JSON.stringify({ upload_id: uploadId }),
			});
		},
		async abort(uploadId) {
			await api<null>("/api/fs/multipart/abort", {
				method: "POST",
				body: JSON.stringify({ upload_id: uploadId }),
			});
		},
	};
}

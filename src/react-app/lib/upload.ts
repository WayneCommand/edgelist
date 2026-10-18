/**
 * Getting a file to the server.
 *
 * A Worker request cannot carry an unbounded body, so a large file cannot go up in
 * one `PUT /api/fs/put`. Object storage can be told to accept a file in parts and
 * reassemble them (`/api/fs/multipart/*`), and that is the only way past the
 * ceiling; WebDAV and a proxied OpenList have no server-side assembly to call, so for
 * them the ceiling is final and the honest answer is to refuse before the bytes move
 * rather than to send 300 MB into a request that will be rejected.
 *
 * The decisions are plain functions and the loop takes an injected transport, so the
 * routing rules and the retry behaviour are testable without a browser or a server.
 */

import * as api from "./api";
import { formatSize } from "./format";
import { t } from "./locale";
import { withRetry, type RetryOptions } from "./retry";

/**
 * The largest body a single request can carry.
 *
 * Cloudflare enforces this per account plan — 100 MB on Free and Pro, 200 MB on
 * Business, up to 5 GB on Enterprise — and a request over the limit is rejected at
 * the edge with a 413 before any Worker code runs, so the server cannot answer with a
 * friendlier message and the client cannot ask which plan it is on. 100 MB is
 * therefore the only defensible number: it is the documented floor, and a Business or
 * Enterprise deployment simply switches to a split upload a little earlier than it
 * strictly had to.
 */
export const SINGLE_UPLOAD_LIMIT = 100 * 1024 * 1024;

/** The ceiling as the messages quote it, derived so the two cannot drift. */
export const SINGLE_UPLOAD_LABEL = `${SINGLE_UPLOAD_LIMIT / (1024 * 1024)} MB`;

export type UploadPlan =
	| { transport: "single" }
	| { transport: "chunked" }
	/** The file is too large and nothing can split it, so it cannot be sent. */
	| { transport: "refused" };

/**
 * Which way a file of `size` should go.
 *
 * `chunkable` is three-valued on purpose. `true` and `false` are answers; `null` means
 * the client does not know — the storage list or the driver list has not loaded — and
 * an unknown answer stays permissive: guessing "cannot" would refuse an upload that
 * would have worked, whereas guessing "can" costs one request the Worker answers with
 * a clear refusal, and a file past the ceiling has nowhere else to go anyway.
 */
export function uploadPlanFor(size: number, chunkable: boolean | null): UploadPlan {
	if (size <= SINGLE_UPLOAD_LIMIT) return { transport: "single" };
	if (chunkable === false) return { transport: "refused" };
	return { transport: "chunked" };
}

/** Why a file past the ceiling cannot be uploaded to this storage. */
export function ceilingReason(name: string, size: number): string {
	return t("upload.ceiling_reason", { name, size: formatSize(size), limit: SINGLE_UPLOAD_LABEL });
}

/**
 * What to say about the ceiling in a directory whose storage cannot split an upload,
 * or `null` where the note would not apply.
 *
 * Only a definite "cannot" earns a note. A capable storage has no ceiling worth
 * mentioning, and an unknown one may well be capable — a warning about a limit that
 * turns out not to exist teaches the user to distrust the ones that are real.
 */
export function ceilingHint(chunkable: boolean | null): string | null {
	if (chunkable !== false) return null;
	return t("upload.ceiling_hint", { limit: SINGLE_UPLOAD_LABEL });
}

export type ChunkRange = { index: number; start: number; end: number };

/**
 * The slices a file is cut into, in the order the server must receive them.
 *
 * The count has to match the server's own `Math.ceil(size / chunk_size)`, which is
 * what it checks the assembled parts against — an off-by-one here would be refused as
 * an incomplete upload rather than silently truncated, but it would still be a failed
 * upload of a file that was already sent.
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

/** The five endpoints as the loop needs them, injected so the loop can be tested. */
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
 * Send one file in parts: open a session, push each chunk in order, assemble.
 *
 * Chunks go up **one at a time** because the session lives in KV and is read, changed
 * and written back on every chunk — two in flight would race and the loser's part
 * number would be dropped from the record even though the provider kept the part.
 *
 * Any failure aborts the session. The parts the provider is holding have no other way
 * to be released: a Worker has no background job to reap an abandoned upload, so
 * leaving the session open would leave the parts behind until they expire. Aborting is
 * best effort — the session may already be gone — and the original error is what the
 * caller sees either way.
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
		throw new Error(t("upload.positive_size"));
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
 * Retried, because a large body is the likeliest thing in this app to meet a dropped
 * connection, and a `PUT` to a path is idempotent: the same bytes land in the same
 * place, so a second attempt cannot duplicate anything.
 */
export async function uploadFile(
	destination: string,
	file: Blob,
	contentType: string,
	retry: RetryOptions = {},
): Promise<void> {
	await withRetry(() => api.writeFile(destination, file, contentType || "application/octet-stream"), retry);
}

/** The endpoints, over the authenticated API client. */
export function workerTransport(): ChunkTransport {
	return {
		async init(targetPath, size) {
			const data = await api.multipartInit(targetPath, size);
			return { uploadId: data.upload_id, chunkSize: data.chunk_size };
		},
		chunk(uploadId, index, body) {
			return api.multipartChunk(uploadId, index, body);
		},
		complete(uploadId) {
			return api.multipartComplete(uploadId).then(() => undefined);
		},
		abort(uploadId) {
			return api.multipartAbort(uploadId).then(() => undefined);
		},
	};
}

import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { canWrite, getNearestMeta } from "./meta";
import { failure, respond } from "./response";
import { invalidateDirectory } from "./storage/cache";
import { resolveStorage } from "./storage/factory";
import { normalizePath, ObjMask, parentOf, type MultipartPart } from "./storage/types";
import { checkWriteMask } from "./fs";

type FsContext = Context<{ Bindings: Env & EdgeListBindings; Variables: { auth: Record<string, unknown> } }>;

/**
 * Split uploads, for files too large to pass through the Worker in one request.
 *
 * A Worker has a request-body ceiling, so a single `PUT /api/fs/put` cannot
 * carry an arbitrarily large file. An object store can be told to accept a
 * file in parts and assemble them itself (`CreateMultipartUpload` /
 * `UploadPart` / `CompleteMultipartUpload`), and that is what this module
 * exposes. Only a driver that declares the `multipart` capability can serve it;
 * everything else is refused up front with a reason, because silently accepting
 * a chunk it cannot store would be worse than refusing.
 *
 * Where this differs from OpenList, which keeps sessions in memory and parks
 * parts on its own disk: a Worker has neither. The session lives in KV with a
 * TTL, which also serves as the cleanup — there is no background job to reap
 * abandoned uploads, so the TTL is the only reaper there is. An abandoned
 * upload therefore leaves the parts the provider is holding until it is
 * aborted or expires; nothing here can enumerate them.
 *
 * Two consequences of that choice, both of which the caller has to respect:
 *
 * - The session is read, changed and written back on every chunk, so chunks
 *   must be sent **one at a time**. Two in flight would race, and the loser's
 *   part number would be lost from the record even though the provider kept it.
 * - KV is eventually consistent across locations. A client whose requests keep
 *   landing in one datacentre sees its own writes immediately, which is the
 *   normal case, but it is not a guarantee. Durable Objects would be, and are
 *   the upgrade path if this ever matters.
 */

interface SessionPart extends MultipartPart {
	/** Byte length of the part, so the sum can be checked against the file size. */
	size: number;
}

interface MultipartSession {
	/** Ours, not the provider's: the client quotes this one back. */
	id: string;
	/** Virtual path of the object being written. */
	path: string;
	/** The provider's own upload id, opaque above the adapter. */
	upload_id: string;
	size: number;
	chunk_size: number;
	parts: SessionPart[];
	created: string;
}

/**
 * S3 refuses any part but the last below 5 MiB, so a client cannot ask for a
 * smaller chunk than this and get away with it. 8 MiB sits above the floor with
 * room to spare and keeps a chunk comfortably inside a Worker's memory budget.
 */
export const MULTIPART_MIN_CHUNK_SIZE = 5 * 1024 * 1024;
export const MULTIPART_DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

/** KV's own expiry is the cleanup: nothing else can reach an abandoned upload. */
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_PREFIX = "multipart:";
const SESSION_ID = /^[a-f0-9]{32}$/;

function sessionKey(id: string): string {
	return `${SESSION_PREFIX}${id}`;
}

/**
 * The session id is generated here, but it arrives back from a client, so it is
 * checked before it becomes a KV key — an id that is not the shape we issue is
 * not a session, and letting it through would mean writing an arbitrary key.
 */
async function readSession(kv: KVNamespace, id: string): Promise<MultipartSession | null> {
	if (!SESSION_ID.test(id)) return null;
	const value = await kv.get(sessionKey(id), "json");
	return value ? (value as MultipartSession) : null;
}

async function writeSession(kv: KVNamespace, session: MultipartSession): Promise<void> {
	await kv.put(sessionKey(session.id), JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
}

async function dropSession(kv: KVNamespace, id: string): Promise<void> {
	await kv.delete(sessionKey(id));
}

function sessionId(): string {
	return crypto.randomUUID().replaceAll("-", "");
}

function chunkSizeOf(requested: unknown): number {
	const value = Number(requested);
	if (!Number.isFinite(value) || value < MULTIPART_MIN_CHUNK_SIZE) return MULTIPART_DEFAULT_CHUNK_SIZE;
	return Math.trunc(value);
}

async function body<T>(c: FsContext): Promise<T> {
	return c.req.json<T>();
}

/**
 * The parts a session still needs, in the order the provider must receive them.
 * A part number is 1-based here because that is what S3 calls it; the client
 * counts chunks from zero, and the two are translated at this boundary only.
 */
function uploadedIndexes(session: MultipartSession): number[] {
	return session.parts.map((part) => part.part_number - 1).sort((left, right) => left - right);
}

export async function fsMultipartInit(c: FsContext) {
	try {
		const input = await body<{ path?: string; size?: number; chunk_size?: number }>(c);
		if (!input.path) return failure("path is required", 400);
		const size = Number(input.size);
		if (!Number.isFinite(size) || size <= 0)
			return failure("A split upload needs a positive size; send empty files through /api/fs/put", 400);
		const targetPath = normalizePath(input.path);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, targetPath);
		if (!canWrite(user, meta, targetPath)) return failure("Access denied", 403);
		const maskError = await checkWriteMask(c, targetPath, ObjMask.NoWrite, "Cannot write to this item", true);
		if (maskError) return maskError;
		const resolved = await resolveStorage(c.env, targetPath);
		if (!resolved.adapter.capabilities.has("multipart") || !resolved.adapter.multipartInit) {
			return failure("Chunked upload is only available for object storage", 400);
		}
		const uploadId = await resolved.adapter.multipartInit(resolved.path);
		const session: MultipartSession = {
			id: sessionId(),
			path: targetPath,
			upload_id: uploadId,
			size: Math.trunc(size),
			chunk_size: chunkSizeOf(input.chunk_size),
			parts: [],
			created: new Date().toISOString(),
		};
		await writeSession(c.env.EDGE_CONFIG, session);
		return respond(c, { upload_id: session.id, chunk_size: session.chunk_size });
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to start a split upload", 400);
	}
}

export async function fsMultipartChunk(c: FsContext) {
	try {
		const session = await readSession(c.env.EDGE_CONFIG, c.req.header("X-Upload-Id") ?? "");
		if (!session) return failure("Upload session not found or expired", 404);
		const index = Number(c.req.header("X-Chunk-Index"));
		if (!Number.isInteger(index) || index < 0) return failure("X-Chunk-Index must be a non-negative integer", 400);
		const payload = await c.req.arrayBuffer();
		if (!payload.byteLength) return failure("A chunk must not be empty", 400);
		const resolved = await resolveStorage(c.env, session.path);
		if (!resolved.adapter.multipartUploadPart) return failure("Chunked upload is not available for this storage", 400);
		const etag = await resolved.adapter.multipartUploadPart(resolved.path, session.upload_id, index + 1, payload);
		// A retried chunk replaces its earlier attempt rather than adding a second
		// part: the provider keys parts by number, and so does this list.
		const part: SessionPart = { part_number: index + 1, etag, size: payload.byteLength };
		session.parts = [...session.parts.filter((entry) => entry.part_number !== part.part_number), part];
		await writeSession(c.env.EDGE_CONFIG, session);
		return respond(c, { upload_id: session.id, uploaded: uploadedIndexes(session) });
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to store the chunk", 400);
	}
}

export async function fsMultipartComplete(c: FsContext) {
	try {
		const input = await body<{ upload_id?: string }>(c);
		const session = await readSession(c.env.EDGE_CONFIG, input.upload_id ?? "");
		if (!session) return failure("Upload session not found or expired", 404);
		const resolved = await resolveStorage(c.env, session.path);
		if (!resolved.adapter.multipartComplete) return failure("Chunked upload is not available for this storage", 400);
		const expected = Math.ceil(session.size / session.chunk_size);
		const parts = [...session.parts].sort((left, right) => left.part_number - right.part_number);
		// The provider assembles whatever it is handed, in order, and reports
		// success either way — a missing middle part would produce a shorter file
		// with no error anywhere. So the parts are checked against the size the
		// client declared before anything is assembled.
		const contiguous = parts.every((part, position) => part.part_number === position + 1);
		const covered = parts.reduce((total, part) => total + part.size, 0);
		if (!contiguous || parts.length !== expected || covered !== session.size) {
			return failure(
				`Upload is incomplete: ${parts.length} of ${expected} chunks covering ${covered} of ${session.size} bytes`,
				400,
			);
		}
		await resolved.adapter.multipartComplete(resolved.path, session.upload_id, parts);
		await dropSession(c.env.EDGE_CONFIG, session.id);
		// The object did not exist while the parts were going up, so the only
		// listing that changed is the one it now appears in.
		await invalidateDirectory(parentOf(session.path));
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to complete the upload", 400);
	}
}

export async function fsMultipartStatus(c: FsContext) {
	try {
		const input = await body<{ upload_id?: string }>(c);
		const session = await readSession(c.env.EDGE_CONFIG, input.upload_id ?? "");
		if (!session) return failure("Upload session not found or expired", 404);
		return respond(c, {
			upload_id: session.id,
			path: session.path,
			size: session.size,
			chunk_size: session.chunk_size,
			uploaded: uploadedIndexes(session),
		});
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to read the upload", 400);
	}
}

export async function fsMultipartAbort(c: FsContext) {
	try {
		const input = await body<{ upload_id?: string }>(c);
		const session = await readSession(c.env.EDGE_CONFIG, input.upload_id ?? "");
		// Aborting twice, or aborting something that already expired, is the
		// caller cleaning up after itself — the outcome it wants is already true.
		if (!session) return respond(c, null);
		try {
			const resolved = await resolveStorage(c.env, session.path);
			await resolved.adapter.multipartAbort?.(resolved.path, session.upload_id);
		} catch {
			// The provider may already have discarded the upload. The session is
			// dropped either way, so nothing is left pointing at it.
		}
		await dropSession(c.env.EDGE_CONFIG, session.id);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to abort the upload", 400);
	}
}

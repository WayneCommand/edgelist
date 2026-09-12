import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./index";

/**
 * The split-upload endpoints exist because a Worker has a request-body ceiling,
 * so a single `PUT /api/fs/put` cannot carry an arbitrarily large file. These
 * tests drive the whole flow through `app.request` against a stubbed `fetch`,
 * so what is asserted is the S3 conversation the adapter actually holds —
 * `?uploads`, `partNumber`, the completion document — not just our own
 * bookkeeping.
 */

const ACCESS_KEY = "test-access-key";
const SECRET_KEY = "test-secret-key";
const MOUNT = "/waynecos";
const MIB = 1024 * 1024;

function fakeKv(values: Record<string, unknown>) {
	const store = new Map<string, string>(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
	const kv = {
		get: async (key: string, type?: string) => {
			const raw = store.get(key);
			if (raw === undefined) return null;
			return type === "json" ? JSON.parse(raw) : raw;
		},
		put: async (key: string, value: string) => {
			store.set(key, value);
		},
		delete: async (key: string) => {
			store.delete(key);
		},
	} as unknown as KVNamespace;
	return { kv, store };
}

function envWith(storages: unknown[]) {
	const { kv, store } = fakeKv({
		"config:auth": { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
		"config:storages": storages,
	});
	return { env: { EDGE_CONFIG: kv }, store };
}

function s3Mount(mount_path: string) {
	return {
		id: 1,
		mount_path,
		order: 0,
		driver: "object",
		addition: JSON.stringify({
			endpoint: "https://s3.example.test",
			bucket: "bucket",
			access_key_id: "key",
			secret_access_key: "secret",
		}),
	};
}

const { env, store } = envWith([s3Mount(MOUNT)]);

/** The KV entry a session id owns, so a test can prove it was cleaned up. */
function sessionEntry(id: string): string {
	return `multipart:${id}`;
}

interface Call {
	method: string;
	url: string;
	body: string;
	bodyBytes: number;
}

/** Answers the four S3 multipart subresources and records every request. */
function stubS3() {
	const calls: Call[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			const method = init?.method ?? "GET";
			const body = typeof init?.body === "string" ? init.body : "";
			const bodyBytes = init?.body instanceof ArrayBuffer ? init.body.byteLength : 0;
			calls.push({ method, url: url.href, body, bodyBytes });
			if (method === "POST" && url.searchParams.has("uploads")) {
				return new Response(
					"<InitiateMultipartUploadResult><UploadId>provider-upload-1</UploadId></InitiateMultipartUploadResult>",
					{ status: 200 },
				);
			}
			if (method === "PUT" && url.searchParams.has("partNumber")) {
				const part = url.searchParams.get("partNumber");
				return new Response(null, { status: 200, headers: { etag: `"etag-${part}"` } });
			}
			return new Response(null, { status: 200 });
		}),
	);
	return calls;
}

async function sessionToken(target = env): Promise<string> {
	const response = await app.request(
		"/api/auth/login",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ username: ACCESS_KEY, password: SECRET_KEY }),
		},
		target,
	);
	const body = (await response.json()) as { data: { token: string } };
	return body.data.token;
}

async function post(path: string, token: string, body: unknown, target = env) {
	return app.request(
		path,
		{
			method: "POST",
			headers: { Authorization: token, "content-type": "application/json" },
			body: JSON.stringify(body),
		},
		target,
	);
}

async function chunk(token: string, uploadId: string, index: number, bytes: number, target = env) {
	return app.request(
		"/api/fs/multipart/chunk",
		{
			method: "PUT",
			headers: { Authorization: token, "X-Upload-Id": uploadId, "X-Chunk-Index": String(index) },
			body: new Uint8Array(bytes),
		},
		target,
	);
}

async function init(token: string, body: Record<string, unknown>, target = env) {
	const response = await post("/api/fs/multipart/init", token, body, target);
	return { response, payload: (await response.json()) as { data: { upload_id: string; chunk_size: number } } };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("the split upload endpoints", () => {
	it("opens a provider upload and answers with our session id", async () => {
		const calls = stubS3();
		const token = await sessionToken();
		const { response, payload } = await init(token, { path: `${MOUNT}/big.bin`, size: 12 });

		expect(response.status).toBe(200);
		expect(payload.data.upload_id).toMatch(/^[a-f0-9]{32}$/);
		expect(payload.data.chunk_size).toBe(8 * MIB);
		// The provider's own id is kept server-side; the client never sees it.
		expect(payload.data.upload_id).not.toBe("provider-upload-1");
		expect(calls[0].method).toBe("POST");
		expect(new URL(calls[0].url).searchParams.has("uploads")).toBe(true);
	});

	it("uploads a chunk as a numbered part and reports it as sent", async () => {
		const calls = stubS3();
		const token = await sessionToken();
		const { payload } = await init(token, { path: `${MOUNT}/big.bin`, size: 12 });

		const response = await chunk(token, payload.data.upload_id, 0, 12);
		const body = (await response.json()) as { data: { uploaded: number[] } };
		expect(response.status).toBe(200);
		expect(body.data.uploaded).toEqual([0]);

		const part = calls.find((call) => call.method === "PUT" && new URL(call.url).searchParams.has("partNumber"))!;
		const query = new URL(part.url).searchParams;
		// The client counts chunks from zero; S3 counts parts from one.
		expect(query.get("partNumber")).toBe("1");
		expect(query.get("uploadId")).toBe("provider-upload-1");
		expect(part.bodyBytes).toBe(12);
	});

	it("assembles the parts in one completion document and drops the session", async () => {
		const calls = stubS3();
		const token = await sessionToken();
		const { payload } = await init(token, { path: `${MOUNT}/big.bin`, size: 12 });
		await chunk(token, payload.data.upload_id, 0, 12);

		const response = await post("/api/fs/multipart/complete", token, { upload_id: payload.data.upload_id });
		expect(response.status).toBe(200);

		const complete = calls.find((call) => call.method === "POST" && new URL(call.url).searchParams.has("uploadId"))!;
		expect(new URL(complete.url).searchParams.get("uploadId")).toBe("provider-upload-1");
		expect(complete.body).toContain("<PartNumber>1</PartNumber>");
		// The ETag has to go back exactly as the provider sent it, quotes and all.
		expect(complete.body).toContain("<ETag>&quot;etag-1&quot;</ETag>");
		// A completed session must not linger: it can never be resumed.
		expect(store.has(sessionEntry(payload.data.upload_id))).toBe(false);
	});

	it("replaces a retried chunk instead of recording it twice", async () => {
		stubS3();
		const token = await sessionToken();
		const { payload } = await init(token, { path: `${MOUNT}/big.bin`, size: 12 });

		await chunk(token, payload.data.upload_id, 0, 12);
		const retried = await chunk(token, payload.data.upload_id, 0, 12);
		const body = (await retried.json()) as { data: { uploaded: number[] } };
		expect(body.data.uploaded).toEqual([0]);
	});

	it("refuses to assemble an upload whose parts do not add up", async () => {
		stubS3();
		const token = await sessionToken();
		// Two chunks are needed; only one arrives, and it is not the right size.
		const { payload } = await init(token, {
			path: `${MOUNT}/big.bin`,
			size: 5 * MIB + 1,
			chunk_size: 5 * MIB,
		});
		await chunk(token, payload.data.upload_id, 0, 10);

		const response = await post("/api/fs/multipart/complete", token, { upload_id: payload.data.upload_id });
		expect(response.status).toBe(400);
		const body = (await response.json()) as { message: string };
		// S3 assembles whatever it is handed without complaining, so this check is
		// the only thing standing between a lost chunk and a silently short file.
		expect(body.message).toContain("Upload is incomplete");
	});

	it("reports where a resumed upload got to", async () => {
		stubS3();
		const token = await sessionToken();
		const { payload } = await init(token, { path: `${MOUNT}/big.bin`, size: 12 });
		await chunk(token, payload.data.upload_id, 0, 12);

		const response = await post("/api/fs/multipart/status", token, { upload_id: payload.data.upload_id });
		const body = (await response.json()) as {
			data: { path: string; size: number; uploaded: number[]; chunk_size: number };
		};
		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({ path: `${MOUNT}/big.bin`, size: 12, uploaded: [0] });
	});

	it("aborts at the provider and forgets the session", async () => {
		const calls = stubS3();
		const token = await sessionToken();
		const { payload } = await init(token, { path: `${MOUNT}/big.bin`, size: 12 });
		await chunk(token, payload.data.upload_id, 0, 12);

		const response = await post("/api/fs/multipart/abort", token, { upload_id: payload.data.upload_id });
		expect(response.status).toBe(200);
		const aborted = calls.find((call) => call.method === "DELETE")!;
		expect(new URL(aborted.url).searchParams.get("uploadId")).toBe("provider-upload-1");
		expect(store.has(sessionEntry(payload.data.upload_id))).toBe(false);
		// Aborting again is cleanup, not an error.
		const again = await post("/api/fs/multipart/abort", token, { upload_id: payload.data.upload_id });
		expect(again.status).toBe(200);
	});

	it("refuses a chunk or a completion it cannot identify", async () => {
		stubS3();
		const token = await sessionToken();
		expect((await chunk(token, "not-a-session", 0, 4)).status).toBe(404);
		// An id of the right shape that was never issued is still a miss.
		expect((await chunk(token, "a".repeat(32), 0, 4)).status).toBe(404);
		expect((await post("/api/fs/multipart/complete", token, { upload_id: "a".repeat(32) })).status).toBe(404);
	});

	it("refuses a split upload on a driver that cannot reassemble parts", async () => {
		stubS3();
		const webdav = envWith([
			{
				id: 2,
				mount_path: "/jianguoyun",
				order: 0,
				driver: "webdav",
				addition: JSON.stringify({ url: "https://webdav.example.test" }),
			},
		]);
		const token = await sessionToken(webdav.env);
		const response = await post("/api/fs/multipart/init", token, { path: "/jianguoyun/big.bin", size: 12 }, webdav.env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { message: string };
		expect(body.message).toContain("object storage");
	});

	it("requires a size, because an empty file has no parts", async () => {
		stubS3();
		const token = await sessionToken();
		expect((await post("/api/fs/multipart/init", token, { path: `${MOUNT}/big.bin` })).status).toBe(400);
		expect((await post("/api/fs/multipart/init", token, { path: `${MOUNT}/big.bin`, size: 0 })).status).toBe(400);
	});

	it("still requires a session", async () => {
		const response = await app.request("/api/fs/multipart/init", { method: "POST", body: "{}" }, env);
		expect(response.status).toBe(401);
	});
});

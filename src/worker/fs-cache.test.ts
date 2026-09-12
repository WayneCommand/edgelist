import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./index";
import { directoryCacheKey, type DirectoryCache } from "./storage/cache";

/**
 * The directory cache is only worth having if the worker actually reads through
 * it. `storage/cache.test.ts` covers the cache itself; this file covers the
 * wiring — that `/api/fs/list` consults it, that `refresh` bypasses it, and
 * that a write drops the listing it just made wrong.
 *
 * The adapter is a real `S3Adapter` over a stubbed `fetch`, so the listing that
 * gets cached is a listing the adapter actually produced, not a fixture handed
 * straight to the cache.
 */

const ACCESS_KEY = "test-access-key";
const SECRET_KEY = "test-secret-key";
const MOUNT = "/waynecos";

function listingXml() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Name>bucket</Name>
	<IsTruncated>false</IsTruncated>
	<Contents><Key>single.txt</Key><LastModified>2024-01-01T00:00:00.000Z</LastModified><ETag>&quot;d41d8cd98f00b204e9800998ecf8427e&quot;</ETag><Size>10</Size></Contents>
</ListBucketResult>`;
}

function fakeKv(values: Record<string, unknown>): KVNamespace {
	return {
		get: async (key: string) => values[key] ?? null,
	} as unknown as KVNamespace;
}

function fakeCache() {
	const store = new Map<string, Response>();
	const seen = { put: [] as string[], deleted: [] as string[] };
	const cache: DirectoryCache = {
		match: async (request) => store.get(request.url)?.clone(),
		put: async (request, response) => {
			seen.put.push(request.url);
			store.set(request.url, response);
		},
		delete: async (request) => {
			seen.deleted.push(request.url);
			return store.delete(request.url);
		},
	};
	return { cache, seen };
}

const env = {
	EDGE_CONFIG: fakeKv({
		"config:auth": { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
		"config:storages": [
			{
				id: 1,
				mount_path: MOUNT,
				order: 0,
				driver: "object",
				addition: JSON.stringify({
					endpoint: "https://s3.example.test",
					bucket: "bucket",
					access_key_id: "key",
					secret_access_key: "secret",
				}),
			},
		],
	}),
};

/** The same credentials, with whatever mounts a test needs. */
function envWith(mountPaths: string[]) {
	return {
		EDGE_CONFIG: fakeKv({
			"config:auth": { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
			"config:storages": mountPaths.map((mount_path, index) => ({
				id: index + 1,
				mount_path,
				order: index,
				driver: "object",
				addition: JSON.stringify({
					endpoint: "https://s3.example.test",
					bucket: "bucket",
					access_key_id: "key",
					secret_access_key: "secret",
				}),
			})),
		}),
	};
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

function stubFetch() {
	const calls = { count: 0 };
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => {
			calls.count += 1;
			return { ok: true, status: 200, text: async () => listingXml() };
		}),
	);
	return calls;
}

async function list(token: string, body: Record<string, unknown>, target = env) {
	return app.request(
		"/api/fs/list",
		{
			method: "POST",
			headers: { Authorization: token, "content-type": "application/json" },
			body: JSON.stringify(body),
		},
		target,
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("the directory cache in front of /api/fs/list", () => {
	it("lists once, then serves the second read from the cache", async () => {
		const { cache } = fakeCache();
		vi.stubGlobal("caches", { default: cache });
		const calls = stubFetch();
		const token = await sessionToken();

		const first = await list(token, { path: MOUNT });
		expect(first.status).toBe(200);
		const firstBody = (await first.json()) as { data: { content: Array<{ name: string }> } };
		expect(firstBody.data.content.map((entry) => entry.name)).toEqual(["single.txt"]);
		expect(calls.count).toBe(1);

		const second = await list(token, { path: MOUNT });
		expect(second.status).toBe(200);
		expect(calls.count).toBe(1);
	});

	it("reads past the cache when the client asks to refresh", async () => {
		const { cache } = fakeCache();
		vi.stubGlobal("caches", { default: cache });
		const calls = stubFetch();
		const token = await sessionToken();

		await list(token, { path: MOUNT });
		expect(calls.count).toBe(1);
		await list(token, { path: MOUNT, refresh: true });
		expect(calls.count).toBe(2);
	});

	it("drops the listing a write has just invalidated", async () => {
		const { cache, seen } = fakeCache();
		vi.stubGlobal("caches", { default: cache });
		const calls = stubFetch();
		const token = await sessionToken();

		await list(token, { path: MOUNT });
		expect(seen.put).toEqual([directoryCacheKey(MOUNT).url]);

		// Creating a child changes the parent's listing, so the parent's entry is
		// the one that has to go.
		const created = await app.request(
			"/api/fs/mkdir",
			{
				method: "POST",
				headers: { Authorization: token, "content-type": "application/json" },
				body: JSON.stringify({ path: `${MOUNT}/new` }),
			},
			env,
		);
		expect(created.status).toBe(200);
		expect(seen.deleted).toEqual([directoryCacheKey(MOUNT).url]);

		// The next read cannot be a hit, so it reaches the adapter again.
		const before = calls.count;
		await list(token, { path: MOUNT });
		expect(calls.count).toBe(before + 1);
	});

	it("keys the cache on the virtual path, so two mounts cannot share an entry", async () => {
		// A mount at `/` and one at `/waynecos` both ask their adapter for
		// `/docs` when the client asks for `/docs` and `/waynecos/docs`. A key
		// built from the adapter's path would let the two listings collide and
		// serve one mount's contents under the other's name.
		const twoMounts = envWith(["/", MOUNT]);
		const { cache, seen } = fakeCache();
		vi.stubGlobal("caches", { default: cache });
		stubFetch();
		const token = await sessionToken(twoMounts);

		await list(token, { path: "/docs" }, twoMounts);
		await list(token, { path: `${MOUNT}/docs` }, twoMounts);

		expect(seen.put).toEqual([directoryCacheKey("/docs").url, directoryCacheKey(`${MOUNT}/docs`).url]);
		expect(seen.put).not.toContain(directoryCacheKey(MOUNT).url);
	});

	it("still lists correctly when the runtime has no cache", async () => {
		const calls = stubFetch();
		const token = await sessionToken();
		const response = await list(token, { path: MOUNT });
		const body = (await response.json()) as { data: { content: Array<{ name: string }> } };
		expect(body.data.content.map((entry) => entry.name)).toEqual(["single.txt"]);
		expect(calls.count).toBe(1);
	});
});

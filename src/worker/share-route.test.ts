import { describe, expect, it, beforeEach, vi } from "vitest";
import app from "./index";
import { CONFIG_KEYS } from "./env";
import type { MetaConfig } from "./meta";

/**
 * The share routes, end to end through the Worker.
 *
 * These exercise the promise the feature makes: nothing is public until a record
 * says so, and the public routes enforce expiry, the view ceiling and the code
 * without a session. The store is a real in-memory KV so the tests go through
 * `readConfig`/`put` exactly as the deployment does — a mock that answers any key
 * would hide a wrong key, which is a bug this repo has already had once.
 */

const AUTH = { accessKey: "key", secretKey: "secret" };

/**
 * A storage serving one small file, so the download route's headers can be
 * asserted. Without a mount the route stops at "Storage not found", which hides
 * the CORS and content-type behaviour — the tests would pass by failing earlier.
 *
 * Every object reports `application/octet-stream`, as an object store commonly
 * does, so the extension fallback is what is actually under test.
 */
const FILES: Record<string, string> = {
	"/photo.png": "PNGDATA",
	"/bundle.zip": "ZIPDATA",
	"/token.md": "# token file",
	"/clip.mp4": "MP4DATA",
};

function fakeAdapter() {
	return {
		driver: "object" as const,
		capabilities: new Set(["read"]),
		get: async (path: string) => {
			const body = FILES[path];
			if (body === undefined) throw new Error("NoSuchKey");
			return {
				name: path,
				size: body.length,
				is_dir: false,
				modified: new Date(0).toISOString(),
				created: new Date(0).toISOString(),
				path,
				mask: 0,
			};
		},
		read: async (path: string, range?: string) => {
			const body = FILES[path];
			if (body === undefined) return new Response("Not found", { status: 404 });
			const bytes = new TextEncoder().encode(body);
			const headers = new Headers({ "content-type": "application/octet-stream" });
			if (range) {
				const [startText, endText] = range.replace("bytes=", "").split("-");
				const start = Number(startText) || 0;
				const end = endText ? Math.min(Number(endText), bytes.length - 1) : bytes.length - 1;
				headers.set("content-range", `bytes ${start}-${end}/${bytes.length}`);
				return new Response(bytes.slice(start, end + 1), { status: 206, headers });
			}
			return new Response(bytes, { status: 200, headers });
		},
	};
}

// Both entry points are replaced: `share.ts` calls `resolveStorage` directly, so
// mocking only the adapter factory would leave the real resolver in place and the
// download would stop at "Storage not found" before any header was set.
vi.mock("./storage/factory", () => ({
	resolveStorage: async (_env: unknown, path: string) => ({
		config: { id: 1, mount_path: "/", order: 0, driver: "object", addition: "{}", remark: "", disabled: false },
		path,
		adapter: fakeAdapter(),
	}),
	createAdapter: () => fakeAdapter(),
	relativeStoragePath: (_mount: string, path: string) => path,
}));

function memoryKv(seed: Record<string, unknown> = {}) {
	const store = new Map<string, string>(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
	return {
		store,
		get: async (key: string, type?: string) => {
			const raw = store.get(key) ?? null;
			if (raw === null) return null;
			return type === "json" ? (JSON.parse(raw) as unknown) : raw;
		},
		put: async (key: string, value: string) => {
			store.set(key, value);
		},
	};
}

function makeEnv(metas: MetaConfig[] = []) {
	const kv = memoryKv({
		[CONFIG_KEYS.auth]: AUTH,
		[CONFIG_KEYS.storages]: [
			{ id: 1, mount_path: "/", order: 0, driver: "object", addition: "{}", remark: "", disabled: false },
		],
		[CONFIG_KEYS.metas]: metas,
	});
	return { env: { EDGE_CONFIG: kv } as unknown as Env, kv };
}

/** The record as it now stands in the store, which is the only place it lives. */
function stored(kv: { store: Map<string, string> }): MetaConfig[] {
	return JSON.parse(kv.store.get(CONFIG_KEYS.metas) ?? "[]") as MetaConfig[];
}

async function token(env: Env): Promise<string> {
	const response = await app.request(
		"/api/auth/login",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ username: AUTH.accessKey, password: AUTH.secretKey }),
		},
		env as never,
	);
	const body = (await response.json()) as { data: { token: string } };
	return body.data.token;
}

function shareRecord(overrides: Partial<MetaConfig> = {}): MetaConfig {
	return { id: 1, path: "/token.md", share: true, share_id: "abc123", ...overrides };
}

const post = (authorization: string, body: unknown) => ({
	method: "POST" as const,
	headers: { "content-type": "application/json", Authorization: authorization },
	body: JSON.stringify(body),
});

describe("public share routes", () => {
	let env: Env;

	beforeEach(() => {
		({ env } = makeEnv([]));
	});

	it("refuses a path that was never shared", async () => {
		const response = await app.request("/api/s/abc123", {}, env as never);
		expect(response.status).toBe(404);
	});

	// The default is the whole point: a file is private until a record says so.
	it("does not publish a path whose rule lacks the share flag", async () => {
		({ env } = makeEnv([{ id: 1, path: "/token.md", readme: "hi" }]));
		const response = await app.request("/api/s/abc123", {}, env as never);
		expect(response.status).toBe(404);
	});

	it("does not inherit a share from a parent rule", async () => {
		// A rule that shares a directory must not publish what is inside it; the
		// listing is how a directory share exposes its children, not the share id.
		({ env } = makeEnv([shareRecord({ path: "/docs", share_id: "docs" })]));
		const response = await app.request("/api/s/token.md", {}, env as never);
		expect(response.status).toBe(404);
	});

	it("answers an expired share with 410, not 404", async () => {
		({ env } = makeEnv([shareRecord({ share_expires: "2000-01-01T00:00:00Z" })]));
		const response = await app.request("/api/s/abc123", {}, env as never);
		expect(response.status).toBe(410);
	});

	it("answers a disabled share with 404 and says it is disabled", async () => {
		({ env } = makeEnv([shareRecord({ share_enabled: false })]));
		const response = await app.request("/api/s/abc123", {}, env as never);
		expect(response.status).toBe(404);
		const body = (await response.json()) as { message: string };
		expect(body.message).toMatch(/disabled/i);
	});

	it("requires the code, and rejects a wrong one", async () => {
		({ env } = makeEnv([shareRecord({ share_code: "letmein" })]));
		const missing = await app.request("/api/s/abc123", {}, env as never);
		expect(missing.status).toBe(401);
		const wrong = await app.request("/api/s/abc123?code=nope", {}, env as never);
		expect(wrong.status).toBe(401);
		const right = await app.request("/api/s/abc123?code=letmein", {}, env as never);
		expect(right.status).toBe(200);
		expect(((await right.json()) as { data: { id: string } }).data.id).toBe("abc123");
	});

	it("does not spend a download on a page view", async () => {
		// "Maximum downloads" is a promise about downloads. Counting the page that
		// precedes one halved the usable limit.
		const { env: local, kv } = makeEnv([shareRecord({ share_max_views: 2 })]);
		await app.request("/api/s/abc123", {}, local as never);
		await app.request("/api/s/abc123", {}, local as never);
		expect(stored(kv)[0].share_views ?? 0).toBe(0);
	});
});

/**
 * The direct link, and the two routes it is split from.
 *
 * `/s/<id>` has to render a page for a browser and `/s/<id>/f` has to serve the
 * file for a program. One route cannot answer both: whichever it chose, the other
 * would be unreachable, and an `<img src>` pointing at a page is as useless as a
 * browser showing raw bytes for a link somebody clicked.
 */
describe("the direct link", () => {
	it("is offered separately from the page", async () => {
		const { env: local } = makeEnv([shareRecord({ path: "/photo.png" })]);
		const authorization = await token(local);
		const listed = await app.request("/api/share/list", { headers: { Authorization: authorization } }, local as never);
		const page = (await listed.json()) as { data: { content: { url: string; raw_url: string }[] } };
		const [share] = page.data.content;
		expect(share.url).toMatch(/\/s\/abc123$/);
		expect(share.raw_url).toMatch(/\/s\/abc123\/f$/);
	});

	it("answers the file itself with its own type and an open CORS policy", async () => {
		// `application/octet-stream` for a `.png` makes every client treat the link
		// as a download; a missing `Access-Control-Allow-Origin` makes an embedding
		// page fail even though the bytes are public.
		const { env: local } = makeEnv([shareRecord({ path: "/photo.png" })]);
		const response = await app.request("/s/abc123/f", { headers: { Origin: "https://example.com" } }, local as never);
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("accept-ranges")).toBe("bytes");
		expect(response.headers.get("content-disposition")).toContain("inline");
		expect(response.headers.get("content-type")).toBe("image/png");
	});

	it("saves anything a browser cannot render", async () => {
		const { env: local } = makeEnv([shareRecord({ path: "/bundle.zip" })]);
		const response = await app.request("/s/abc123/f", {}, local as never);
		expect(response.headers.get("content-disposition")).toContain("attachment");
	});

	it("passes a Range request through and answers 206", async () => {
		const { env: local } = makeEnv([shareRecord()]);
		const response = await app.request("/s/abc123/f", { headers: { Range: "bytes=2-5" } }, local as never);
		expect(response.status).toBe(206);
		expect(response.headers.get("content-range")).toMatch(/^bytes 2-5\//);
	});

	it("does not spend a download on a HEAD probe", async () => {
		// A link checker or a player asking how big the file is must not consume
		// the owner's quota; only a body transferred is a download.
		const { env: local, kv } = makeEnv([shareRecord({ share_max_views: 1 })]);
		const head = await app.request("/s/abc123/f", { method: "HEAD" }, local as never);
		expect(head.status).toBe(200);
		expect(stored(kv)[0].share_views ?? 0).toBe(0);
	});

	it("answers a preflight without opening the share", async () => {
		const { env: local } = makeEnv([shareRecord()]);
		const response = await app.request(
			"/s/abc123/f",
			{ method: "OPTIONS", headers: { Origin: "https://example.com", "Access-Control-Request-Method": "GET" } },
			local as never,
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-allow-headers")).toContain("Range");
	});

	it("still enforces the share on the direct link", async () => {
		// The point of a public route is that it is *still* a share: expiry, the
		// ceiling and the code apply to the file exactly as they do to the page.
		const { env: local } = makeEnv([shareRecord({ share_expires: "2000-01-01T00:00:00Z" })]);
		const response = await app.request("/s/abc123/f", {}, local as never);
		expect(response.status).toBe(410);
	});
});

describe("share management", () => {
	it("creates a share with a generated id, and lists it", async () => {
		const { env: local } = makeEnv([]);
		const authorization = await token(local);
		const created = await app.request("/api/share/create", post(authorization, { path: "/token.md" }), local as never);
		expect(created.status).toBe(200);
		const body = (await created.json()) as { data: { id: string; url: string } };
		expect(body.data.id).toMatch(/^[2-9a-hjkmnp-z]{8}$/);
		expect(body.data.url).toContain(`/s/${body.data.id}`);

		const listed = await app.request("/api/share/list", { headers: { Authorization: authorization } }, local as never);
		const page = (await listed.json()) as { data: { content: { path: string }[] } };
		expect(page.data.content.map((share) => share.path)).toEqual(["/token.md"]);
	});

	it("updates a share in place rather than creating a second record", async () => {
		const { env: local, kv } = makeEnv([]);
		const authorization = await token(local);
		await app.request("/api/share/create", post(authorization, { path: "/token.md" }), local as never);
		await app.request(
			"/api/share/create",
			post(authorization, { path: "/token.md", share_max_views: 5 }),
			local as never,
		);

		expect(stored(kv)).toHaveLength(1);
		expect(stored(kv)[0].share_max_views).toBe(5);
	});

	it("refuses a custom id that another share already uses", async () => {
		const { env: local } = makeEnv([shareRecord({ path: "/other.md", share_id: "taken" })]);
		const authorization = await token(local);
		const response = await app.request(
			"/api/share/create",
			post(authorization, { path: "/token.md", share_id: "taken" }),
			local as never,
		);
		expect(response.status).toBe(409);
	});

	it("removes a rule that existed only to be a share, and keeps one with other work", async () => {
		const { env: local, kv } = makeEnv([
			shareRecord({ id: 1, path: "/bare.md" }),
			shareRecord({ id: 2, path: "/with-readme.md", readme: "Keep me" }),
		]);
		const authorization = await token(local);
		for (const path of ["/bare.md", "/with-readme.md"]) {
			await app.request("/api/share/delete", post(authorization, { path }), local as never);
		}
		// The empty share is gone; the one that still carries a readme survives
		// with its share fields stripped.
		expect(stored(kv).map((rule) => rule.path)).toEqual(["/with-readme.md"]);
		expect(stored(kv)[0].share).toBeUndefined();
		expect(stored(kv)[0].readme).toBe("Keep me");
	});

	it("makes the link stop working the moment it is deleted", async () => {
		const { env: local } = makeEnv([shareRecord()]);
		const authorization = await token(local);
		const before = await app.request("/api/s/abc123", {}, local as never);
		expect(before.status).toBe(200);
		await app.request("/api/share/delete", post(authorization, { path: "/token.md" }), local as never);
		const after = await app.request("/api/s/abc123", {}, local as never);
		expect(after.status).toBe(404);
	});

	it("requires a session to manage shares", async () => {
		const { env: local } = makeEnv([]);
		const response = await app.request("/api/share/list", {}, local as never);
		expect(response.status).toBe(401);
	});
});

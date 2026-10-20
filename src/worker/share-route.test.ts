import { describe, expect, it, beforeEach } from "vitest";
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
	} as unknown as KVNamespace & { store: Map<string, string> };
}

const AUTH = { accessKey: "key", secretKey: "secret" };

function makeEnv(metas: MetaConfig[] = []) {
	const kv = memoryKv({ [CONFIG_KEYS.auth]: AUTH, [CONFIG_KEYS.storages]: [], [CONFIG_KEYS.metas]: metas });
	return { env: { EDGE_CONFIG: kv } as unknown as Env, kv };
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
		({ env } = makeEnv([shareRecord({ share_max_views: 2 })]));
		await app.request("/api/s/abc123", {}, env as never);
		await app.request("/api/s/abc123", {}, env as never);
		const kv = (env as unknown as { EDGE_CONFIG: { store: Map<string, string> } }).EDGE_CONFIG;
		const stored = JSON.parse(kv.store.get(CONFIG_KEYS.metas) ?? "[]") as MetaConfig[];
		expect(stored[0].share_views ?? 0).toBe(0);
	});
});

describe("share management", () => {
	it("creates a share with a generated id, and lists it", async () => {
		const { env } = makeEnv([]);
		const authorization = await token(env);
		const created = await app.request(
			"/api/share/create",
			{
				method: "POST",
				headers: { "content-type": "application/json", Authorization: authorization },
				body: JSON.stringify({ path: "/token.md" }),
			},
			env as never,
		);
		expect(created.status).toBe(200);
		const body = (await created.json()) as { data: { id: string; url: string } };
		expect(body.data.id).toMatch(/^[2-9a-hjkmnp-z]{8}$/);
		expect(body.data.url).toContain(`/s/${body.data.id}`);

		const listed = await app.request("/api/share/list", { headers: { Authorization: authorization } }, env as never);
		const page = (await listed.json()) as { data: { content: { path: string }[] } };
		expect(page.data.content.map((share) => share.path)).toEqual(["/token.md"]);
	});

	it("updates a share in place rather than creating a second record", async () => {
		const { env } = makeEnv([]);
		const authorization = await token(env);
		const payload = (body: unknown) => ({
			method: "POST",
			headers: { "content-type": "application/json", Authorization: authorization },
			body: JSON.stringify(body),
		});
		await app.request("/api/share/create", payload({ path: "/token.md" }), env as never);
		await app.request("/api/share/create", payload({ path: "/token.md", share_max_views: 5 }), env as never);

		const kv = (env as unknown as { EDGE_CONFIG: { store: Map<string, string> } }).EDGE_CONFIG;
		const stored = JSON.parse(kv.store.get(CONFIG_KEYS.metas) ?? "[]") as MetaConfig[];
		expect(stored).toHaveLength(1);
		expect(stored[0].share_max_views).toBe(5);
	});

	it("refuses a custom id that another share already uses", async () => {
		const { env } = makeEnv([shareRecord({ path: "/other.md", share_id: "taken" })]);
		const authorization = await token(env);
		const response = await app.request(
			"/api/share/create",
			{
				method: "POST",
				headers: { "content-type": "application/json", Authorization: authorization },
				body: JSON.stringify({ path: "/token.md", share_id: "taken" }),
			},
			env as never,
		);
		expect(response.status).toBe(409);
	});

	it("removes a rule that existed only to be a share, and keeps one with other work", async () => {
		const { env } = makeEnv([
			shareRecord({ id: 1, path: "/bare.md" }),
			shareRecord({ id: 2, path: "/with-readme.md", readme: "Keep me" }),
		]);
		const authorization = await token(env);
		for (const path of ["/bare.md", "/with-readme.md"]) {
			await app.request(
				"/api/share/delete",
				{
					method: "POST",
					headers: { "content-type": "application/json", Authorization: authorization },
					body: JSON.stringify({ path }),
				},
				env as never,
			);
		}
		const kv = (env as unknown as { EDGE_CONFIG: { store: Map<string, string> } }).EDGE_CONFIG;
		const stored = JSON.parse(kv.store.get(CONFIG_KEYS.metas) ?? "[]") as MetaConfig[];
		// The empty share is gone; the one that still carries a readme survives
		// with its share fields stripped.
		expect(stored.map((rule) => rule.path)).toEqual(["/with-readme.md"]);
		expect(stored[0].share).toBeUndefined();
		expect(stored[0].readme).toBe("Keep me");
	});

	it("makes the link stop working the moment it is deleted", async () => {
		const { env } = makeEnv([shareRecord()]);
		const authorization = await token(env);
		const before = await app.request("/api/s/abc123", {}, env as never);
		expect(before.status).toBe(200);
		await app.request(
			"/api/share/delete",
			{
				method: "POST",
				headers: { "content-type": "application/json", Authorization: authorization },
				body: JSON.stringify({ path: "/token.md" }),
			},
			env as never,
		);
		const after = await app.request("/api/s/abc123", {}, env as never);
		expect(after.status).toBe(404);
	});

	it("requires a session to manage shares", async () => {
		const { env } = makeEnv([]);
		const response = await app.request("/api/share/list", {}, env as never);
		expect(response.status).toBe(401);
	});
});

import { describe, expect, it } from "vitest";
import app from "./index";

/**
 * `/d/*` is the only wildcard route in the app, and everything else depends on
 * it: the previewer fetches from it, and every URL `/api/fs/link` hands out
 * points at it.
 *
 * Hono does not expose a bare `*` as a param — `c.req.param("*")` is null, the
 * path collapses to "/", and every download answers "Storage not found". That is
 * what shipped, because nothing ever routed a request through the app to find
 * out. The wildcard has to be named (`:name{.*}`), and this test is what keeps
 * it named.
 */

const ACCESS_KEY = "test-access-key";
const SECRET_KEY = "test-secret-key";

function fakeKv(values: Record<string, unknown>): KVNamespace {
	return {
		get: async (key: string) => values[key] ?? null,
	} as unknown as KVNamespace;
}

const env = {
	EDGE_CONFIG: fakeKv({
		"config:auth": { accessKey: ACCESS_KEY, secretKey: SECRET_KEY },
		// A mount covering the path under test, so a correct route gets past
		// storage resolution and a broken one is caught by the message it returns.
		"config:storages": [
			{
				id: 1,
				mount_path: "/waynecos",
				driver: "object",
				addition: JSON.stringify({ endpoint: "http://127.0.0.1:1", bucket: "test" }),
			},
		],
	}),
};

async function sessionToken(): Promise<string> {
	const response = await app.request(
		"/api/auth/login",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ username: ACCESS_KEY, password: SECRET_KEY }),
		},
		env,
	);
	const body = (await response.json()) as { data: { token: string } };
	return body.data.token;
}

describe("the /d download route", () => {
	it("carries the whole sub-path through to the handler", async () => {
		const response = await app.request(
			"/d/waynecos/docs/notes.md",
			{ headers: { Authorization: await sessionToken() } },
			env,
		);
		const body = (await response.json()) as { message: string };
		// The adapter cannot reach its endpoint from a test, so the request fails —
		// but it fails *after* storage resolution. "Storage not found" would mean
		// the wildcard was dropped and the path collapsed to "/".
		expect(body.message).not.toBe("Storage not found");
	});

	it("still requires a session", async () => {
		const response = await app.request("/d/waynecos/docs/notes.md", {}, env);
		expect(response.status).toBe(401);
	});

	it("answers 404 for the bare prefix", async () => {
		// The wildcard matches an empty name too, so this resolves to "/" — which
		// no storage serves. Either way the caller gets a 404 rather than a file.
		const response = await app.request("/d/", { headers: { Authorization: await sessionToken() } }, env);
		expect(response.status).toBe(404);
		expect(await response.text()).toContain("Storage not found");
	});
});

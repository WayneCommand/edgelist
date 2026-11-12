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

	it("sends a browser navigation without a session to sign in, and remembers the file", async () => {
		// A pasted link is a document navigation, not a `fetch`: answering it with
		// JSON would leave the visitor staring at `{"code":401...}`. The original
		// path travels as `?redirect=` so signing in can come back to it.
		const response = await app.request(
			"/d/waynecos/docs/notes.md",
			{ headers: { Accept: "text/html,application/xhtml+xml" } },
			env,
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/@login?redirect=%2Fd%2Fwaynecos%2Fdocs%2Fnotes.md");
	});

	it("leaves a session-less fetch with the JSON 401 the app handles", async () => {
		// The previewer expects a failure it can turn into a message; a redirect
		// there would be followed by fetch and turn into an HTML parse error.
		const response = await app.request("/d/waynecos/docs/notes.md", { headers: { Accept: "application/json" } }, env);
		expect(response.status).toBe(401);
	});

	it("puts the session in a cookie a navigation can carry, and only for /d", async () => {
		const response = await app.request(
			"/api/auth/login",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ access_key: ACCESS_KEY, secret_key: SECRET_KEY }),
			},
			env,
		);
		const cookie = response.headers.get("set-cookie") ?? "";
		expect(cookie).toContain("edgelist_download=");
		expect(cookie).toContain("Path=/d");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toMatch(/SameSite=Lax/i);
		// The token is not readable by scripts, which is the point of HttpOnly.
		expect(cookie).not.toContain("document.cookie");
	});

	it("accepts that cookie in place of the Authorization header", async () => {
		const login = await app.request(
			"/api/auth/login",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ access_key: ACCESS_KEY, secret_key: SECRET_KEY }),
			},
			env,
		);
		const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
		const response = await app.request(
			"/d/waynecos/docs/notes.md",
			{ headers: { Cookie: cookie, Accept: "text/html" } },
			env,
		);
		// Reaching the adapter is what this asserts; its network failure is
		// expected in a unit test, but "Storage not found" would mean the cookie
		// was rejected and the path collapsed.
		const body = (await response.json()) as { message: string };
		expect(body.message).not.toBe("Storage not found");
		expect(body.message).not.toBe("Login required");
	});

	it("clears the download cookie on sign-out", async () => {
		const token = await sessionToken();
		const response = await app.request(
			"/api/auth/logout",
			{ headers: { Authorization: token, Cookie: "edgelist_download=stale" } },
			env,
		);
		const cookie = response.headers.get("set-cookie") ?? "";
		expect(cookie).toContain("edgelist_download=");
		expect(cookie).toMatch(/Max-Age=0/i);
	});

	it("can move an existing header session into the cookie", async () => {
		// This is the bridge for a session that predates the cookie, or one whose
		// cookie the browser dropped. Without it, signing in and returning to /d
		// would bounce between the download and the login screen.
		const response = await app.request(
			"/api/auth/download-session",
			{ method: "POST", headers: { Authorization: await sessionToken() } },
			env,
		);
		expect(response.status).toBe(200);
		const cookie = response.headers.get("set-cookie") ?? "";
		expect(cookie).toContain("edgelist_download=");
		expect(cookie).toContain("Path=/d");
		expect(cookie).toContain("HttpOnly");
	});

	it("does not issue the cookie without a session", async () => {
		const response = await app.request("/api/auth/download-session", { method: "POST" }, env);
		expect(response.status).toBe(401);
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	it("answers 404 for the bare prefix", async () => {
		// The wildcard matches an empty name too, so this resolves to "/" — which
		// no storage serves. Either way the caller gets a 404 rather than a file.
		const response = await app.request("/d/", { headers: { Authorization: await sessionToken() } }, env);
		expect(response.status).toBe(404);
		expect(await response.text()).toContain("Storage not found");
	});
});

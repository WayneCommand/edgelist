import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { CONFIG_KEYS, type EdgeListBindings, type EdgeListConfig, readConfig } from "./env";
import { failure, respond, success } from "./response";

type AuthEnv = {
	Bindings: Env & EdgeListBindings;
	Variables: { auth: Record<string, unknown> };
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

/**
 * The download session, as a cookie.
 *
 * The app authenticates with an `Authorization` header, which a browser cannot
 * attach to a link the user opens or pastes. That is fine for the app — every
 * file view goes through `fetch` — but it used to make a copied `/d/...` link
 * useless: opening it proved nothing, and the visitor was sent to the sign-in
 * screen with nowhere to return to. This cookie is the same session token in the
 * one place a document navigation can carry it.
 *
 * It is deliberately narrow: `Path=/d` means it is never sent to the API or the
 * SPA, `HttpOnly` keeps it out of scripts, and the Worker only accepts it on the
 * read-only download route. A leaked cookie therefore buys downloads, not
 * writes. `SameSite=Lax` is enough for a top-level navigation and still blocks a
 * cross-site form from triggering one.
 */
export const DOWNLOAD_COOKIE = "edgelist_download";
const DOWNLOAD_COOKIE_PATH = "/d";

function requestIsSecure(c: Context): boolean {
	return new URL(c.req.url).protocol === "https:";
}

/** Put the session where a browser navigation to `/d/...` can send it. */
export function setDownloadSessionCookie(c: Context, token: string) {
	setCookie(c, DOWNLOAD_COOKIE, token, {
		path: DOWNLOAD_COOKIE_PATH,
		httpOnly: true,
		secure: requestIsSecure(c),
		sameSite: "Lax",
		maxAge: TOKEN_TTL_SECONDS,
	});
}

/** Signing out has to drop this copy too, or the next visitor inherits a download. */
export function clearDownloadSessionCookie(c: Context) {
	deleteCookie(c, DOWNLOAD_COOKIE, { path: DOWNLOAD_COOKIE_PATH });
}

function base64url(value: ArrayBuffer | string): string {
	const encoded = typeof value === "string" ? btoa(value) : btoa(String.fromCharCode(...new Uint8Array(value)));
	return encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64url(value: string): string {
	return atob(value.replaceAll("-", "+").replaceAll("_", "/"));
}

async function sha256(value: string): Promise<string> {
	return base64url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function sign(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
		"verify",
	]);
	return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	if (leftBytes.byteLength !== rightBytes.byteLength) return false;
	let difference = 0;
	for (let i = 0; i < leftBytes.length; i += 1) difference |= leftBytes[i] ^ rightBytes[i];
	return difference === 0;
}

export async function getAuthConfig(kv: KVNamespace): Promise<EdgeListConfig | null> {
	const config = await readConfig(kv, CONFIG_KEYS.auth);
	if (!config || typeof config !== "object") return null;
	const value = config as Partial<EdgeListConfig>;
	if (typeof value.accessKey !== "string" || typeof value.secretKey !== "string") return null;
	return value as EdgeListConfig;
}

interface LoginBody {
	username?: string;
	password?: string;
	access_key?: string;
	secret_key?: string;
}

/**
 * The session token for the single principal this deployment knows.
 *
 * Shared by the password login and the passkey login: both prove the same claim
 * — that the caller is the owner — and the rest of the Worker only ever checks
 * the signature, so a passkey session is not a second kind of session.
 */
export async function createSessionToken(config: EdgeListConfig): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const payload = base64url(JSON.stringify({ sub: config.accessKey, iat: now, exp: now + TOKEN_TTL_SECONDS }));
	return `${payload}.${await sign(payload, config.secretKey)}`;
}

export async function login(c: Context<{ Bindings: Env & EdgeListBindings }>, hashed = false) {
	const body = await c.req.json<LoginBody>().catch(() => ({}) as LoginBody);
	const accessKey = body.access_key ?? body.username ?? "";
	const suppliedSecret = body.secret_key ?? body.password ?? "";
	const config = await getAuthConfig(c.env.EDGE_CONFIG);
	if (!config) return failure("Authentication is not configured", 500);
	const expectedSecret = hashed ? await sha256(config.secretKey) : config.secretKey;
	if (
		!(await constantTimeEqual(accessKey, config.accessKey)) ||
		!(await constantTimeEqual(suppliedSecret, expectedSecret))
	) {
		return failure("Invalid username or password", 401);
	}
	const token = await createSessionToken(config);
	setDownloadSessionCookie(c, token);
	return respond(c, { token });
}

export async function verifyToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
	const [payload, signature] = token.split(".");
	if (!payload || !signature) return null;
	if (!(await constantTimeEqual(signature, await sign(payload, secret)))) return null;
	try {
		const data = JSON.parse(decodeBase64url(payload)) as Record<string, unknown>;
		if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
		return data;
	} catch {
		return null;
	}
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
	const token = c.req.header("Authorization");
	if (!token) return failure("Login required", 401);
	const config = await getAuthConfig(c.env.EDGE_CONFIG);
	const claims = config ? await verifyToken(token, config.secretKey) : null;
	if (!claims) return failure("Invalid or expired token", 401);
	c.set("auth", claims);
	await next();
});

/**
 * The download route's session check.
 *
 * It accepts the same session in the two shapes a caller can present: the
 * `Authorization` header the SPA uses for previews, downloads and thumbnails,
 * and the narrow cookie above for a browser that is *navigating* to a pasted
 * link. A missing session on a navigation is a sign-in detour, not an error
 * page: the link the visitor followed travels as `?redirect=` so they arrive
 * back at the file after signing in. A `fetch` without a session keeps getting
 * the JSON 401 the app knows how to handle.
 */
export const requireDownloadAuth = createMiddleware<AuthEnv>(async (c, next) => {
	const header = c.req.header("Authorization");
	const token = header ?? getCookie(c, DOWNLOAD_COOKIE) ?? "";
	const config = await getAuthConfig(c.env.EDGE_CONFIG);
	const claims = token && config ? await verifyToken(token, config.secretKey) : null;
	if (!claims) {
		const navigation = (c.req.header("Accept") ?? "").includes("text/html");
		if (!header && navigation) {
			const url = new URL(c.req.url);
			return c.redirect(`/@login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
		}
		return failure(token ? "Invalid or expired token" : "Login required", 401);
	}
	c.set("auth", claims);
	await next();
});

/**
 * `POST /api/auth/download-session` — put an existing header session into the
 * download cookie.
 *
 * A session can exist without the cookie: it was issued before the cookie
 * existed, or the browser kept `sessionStorage` but dropped cookies. Without
 * this, the sign-in screen would see a signed-in visitor, hand them back to
 * `/d/...`, and the Worker would send them to sign in again — a loop. The SPA
 * calls this before leaving for a download link, so the navigation always has
 * the credential it needs.
 */
export function downloadSession(c: Context<AuthEnv>) {
	const token = c.req.header("Authorization");
	if (!token) return failure("Login required", 401);
	setDownloadSessionCookie(c, token);
	return respond(c, null);
}

export function currentUser(c: Context<AuthEnv>) {
	const auth = c.get("auth");
	return respond(c, { username: auth?.sub ?? "", is_admin: true, disabled: false });
}

export function logout(c: Context<{ Bindings: Env & EdgeListBindings }>) {
	clearDownloadSessionCookie(c);
	return c.json(success(null));
}

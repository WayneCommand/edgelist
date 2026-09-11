import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { CONFIG_KEYS, type EdgeListBindings, type EdgeListConfig, readConfig } from "./env";
import { failure, respond, success } from "./response";

type AuthEnv = {
	Bindings: Env & EdgeListBindings;
	Variables: { auth: Record<string, unknown> };
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

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
	const now = Math.floor(Date.now() / 1000);
	const payload = base64url(JSON.stringify({ sub: config.accessKey, iat: now, exp: now + TOKEN_TTL_SECONDS }));
	const token = `${payload}.${await sign(payload, config.secretKey)}`;
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

export function currentUser(c: Context<AuthEnv>) {
	const auth = c.get("auth");
	return respond(c, { username: auth?.sub ?? "", is_admin: true, disabled: false });
}

export function logout(c: Context<{ Bindings: Env & EdgeListBindings }>) {
	return c.json(success(null));
}

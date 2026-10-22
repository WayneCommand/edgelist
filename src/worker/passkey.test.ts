import { describe, expect, it } from "vitest";
import app from "./index";
import { CONFIG_KEYS } from "./env";
import { derToRaw, verifyAuthenticationResponse, verifyRegistrationResponse, type PasskeyRecord } from "./passkey";

/**
 * Passkeys, from the CBOR bytes up.
 *
 * A WebAuthn test cannot stub the signature check without testing nothing: the
 * point of the feature is that a key the server stored can verify a challenge it
 * issued. These tests therefore generate a real P-256 key with WebCrypto, build
 * the same CBOR structures an authenticator would, and sign for real. The
 * synthetic parts are the bytes an authenticator would produce, not the checks
 * the Worker performs.
 */

const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function base64url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
	const padded = value
		.replaceAll("-", "+")
		.replaceAll("_", "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", value));
}

/* ------------------------------------------------------------- a tiny CBOR writer */

function head(major: number, length: number): Uint8Array {
	if (length < 24) return Uint8Array.of((major << 5) | length);
	if (length < 0x100) return Uint8Array.of((major << 5) | 24, length);
	if (length < 0x10000) return Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff);
	return Uint8Array.of(
		(major << 5) | 26,
		(length >>> 24) & 0xff,
		(length >>> 16) & 0xff,
		(length >>> 8) & 0xff,
		length & 0xff,
	);
}

function cbor(value: unknown): Uint8Array {
	if (typeof value === "number") {
		return value >= 0 ? head(0, value) : head(1, -1 - value);
	}
	if (typeof value === "string") {
		const bytes = encoder.encode(value);
		return concat(head(3, bytes.length), bytes);
	}
	if (value instanceof Uint8Array) return concat(head(2, value.length), value);
	if (Array.isArray(value)) return concat(head(4, value.length), ...value.map(cbor));
	if (value instanceof Map) {
		const parts: Uint8Array[] = [];
		for (const [key, item] of value) parts.push(cbor(key), cbor(item));
		return concat(head(5, value.size), ...parts);
	}
	throw new Error("Unsupported test CBOR value");
}

/* ------------------------------------------------------------------ fixtures */

interface Fixture {
	pair: CryptoKeyPair;
	challenge: string;
	credentialId: Uint8Array;
	registration: {
		id: string;
		rawId: string;
		type: string;
		response: { clientDataJSON: string; attestationObject: string; transports: string[] };
	};
}

async function makeFixture(options: { rpId: string; origin: string; challenge: string }): Promise<Fixture> {
	const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
		"sign",
		"verify",
	])) as CryptoKeyPair;
	const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
	const cose = cbor(
		new Map<unknown, unknown>([
			[1, 2],
			[3, -7],
			[-1, 1],
			[-2, fromBase64url(jwk.x!)],
			[-3, fromBase64url(jwk.y!)],
		]),
	);
	const credentialId = crypto.getRandomValues(new Uint8Array(16));
	const authData = concat(
		await sha256(encoder.encode(options.rpId)),
		Uint8Array.of(0x41),
		Uint8Array.of(0, 0, 0, 1),
		new Uint8Array(16),
		Uint8Array.of(0, credentialId.length),
		credentialId,
		cose,
	);
	const attestationObject = cbor(
		new Map<unknown, unknown>([
			["fmt", "none"],
			["authData", authData],
			["attStmt", new Map()],
		]),
	);
	const clientData = {
		type: "webauthn.create",
		challenge: options.challenge,
		origin: options.origin,
	};
	return {
		pair,
		challenge: options.challenge,
		credentialId,
		registration: {
			id: base64url(credentialId),
			rawId: base64url(credentialId),
			type: "public-key",
			response: {
				clientDataJSON: base64url(encoder.encode(JSON.stringify(clientData))),
				attestationObject: base64url(attestationObject),
				transports: ["internal"],
			},
		},
	};
}

/** The raw `r || s` WebCrypto produces, wrapped as the DER an assertion carries. */
function rawToDer(raw: Uint8Array): Uint8Array {
	const integer = (bytes: Uint8Array) => {
		let offset = 0;
		while (offset < bytes.length - 1 && bytes[offset] === 0) offset += 1;
		const value = bytes.slice(offset);
		const pad = (value[0] & 0x80) !== 0;
		return concat(Uint8Array.of(0x02, value.length + (pad ? 1 : 0)), pad ? Uint8Array.of(0) : new Uint8Array(), value);
	};
	const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
	return concat(Uint8Array.of(0x30, body.length), body);
}

async function makeAssertion(
	fixture: Fixture,
	options: { rpId: string; origin: string; challenge: string; counter?: number },
) {
	const authData = concat(
		await sha256(encoder.encode(options.rpId)),
		Uint8Array.of(0x01),
		Uint8Array.of(0, 0, 0, options.counter ?? 2),
	);
	const clientData = { type: "webauthn.get", challenge: options.challenge, origin: options.origin };
	const clientDataJSON = encoder.encode(JSON.stringify(clientData));
	const raw = new Uint8Array(
		await crypto.subtle.sign(
			{ name: "ECDSA", hash: "SHA-256" },
			fixture.pair.privateKey,
			concat(authData, await sha256(clientDataJSON)),
		),
	);
	return {
		id: base64url(fixture.credentialId),
		rawId: base64url(fixture.credentialId),
		type: "public-key",
		response: {
			clientDataJSON: base64url(clientDataJSON),
			authenticatorData: base64url(authData),
			signature: base64url(rawToDer(raw)),
			userHandle: null,
		},
	};
}

function recordOf(registration: Awaited<ReturnType<typeof verifyRegistrationResponse>>): PasskeyRecord {
	return {
		id: registration.id,
		public_key: registration.public_key,
		counter: registration.counter,
		transports: registration.transports,
		name: "Test key",
		created_at: new Date().toISOString(),
		backed_up: registration.backed_up,
	};
}

/* ---------------------------------------------------------------------- tests */

describe("derToRaw", () => {
	it("unwraps a DER signature into 64 raw bytes", async () => {
		const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
			"sign",
			"verify",
		])) as CryptoKeyPair;
		const raw = new Uint8Array(
			await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, encoder.encode("x")),
		);
		expect(Array.from(derToRaw(rawToDer(raw)))).toEqual(Array.from(raw));
	});
});

describe("registration verification", () => {
	it("accepts a credential created for this site and keeps its key", async () => {
		const fixture = await makeFixture({ rpId: "localhost", origin: "http://localhost", challenge: "abc" });
		const verified = await verifyRegistrationResponse(fixture.registration, {
			challenge: "abc",
			origin: "http://localhost",
			rpId: "localhost",
		});
		expect(verified.id).toBe(base64url(fixture.credentialId));
		expect(verified.public_key).toMatchObject({ kty: "EC", crv: "P-256" });
		expect(verified.transports).toEqual(["internal"]);
	});

	it("rejects a challenge that was not the one issued", async () => {
		const fixture = await makeFixture({ rpId: "localhost", origin: "http://localhost", challenge: "abc" });
		await expect(
			verifyRegistrationResponse(fixture.registration, {
				challenge: "other",
				origin: "http://localhost",
				rpId: "localhost",
			}),
		).rejects.toThrow(/challenge/i);
	});

	it("rejects a credential created for another origin", async () => {
		const fixture = await makeFixture({ rpId: "localhost", origin: "http://localhost", challenge: "abc" });
		await expect(
			verifyRegistrationResponse(fixture.registration, {
				challenge: "abc",
				origin: "https://evil.example",
				rpId: "localhost",
			}),
		).rejects.toThrow(/site/i);
	});
});

describe("assertion verification", () => {
	it("verifies a signature over the challenge and the RP id", async () => {
		const fixture = await makeFixture({ rpId: "localhost", origin: "http://localhost", challenge: "register" });
		const registration = await verifyRegistrationResponse(fixture.registration, {
			challenge: "register",
			origin: "http://localhost",
			rpId: "localhost",
		});
		const record = recordOf(registration);
		const assertion = await makeAssertion(fixture, {
			rpId: "localhost",
			origin: "http://localhost",
			challenge: "login",
			counter: 2,
		});
		const result = await verifyAuthenticationResponse(
			assertion,
			{ challenge: "login", origin: "http://localhost", rpId: "localhost" },
			record,
		);
		expect(result.counter).toBe(2);
	});

	it("rejects a signature made for another challenge", async () => {
		const fixture = await makeFixture({ rpId: "localhost", origin: "http://localhost", challenge: "register" });
		const registration = await verifyRegistrationResponse(fixture.registration, {
			challenge: "register",
			origin: "http://localhost",
			rpId: "localhost",
		});
		const assertion = await makeAssertion(fixture, {
			rpId: "localhost",
			origin: "http://localhost",
			challenge: "login",
		});
		await expect(
			verifyAuthenticationResponse(
				assertion,
				{ challenge: "other", origin: "http://localhost", rpId: "localhost" },
				recordOf(registration),
			),
		).rejects.toThrow(/challenge/i);
	});
});

/* ------------------------------------------------------------------- the routes */

function memoryKv(seed: Record<string, unknown> = {}) {
	const store = new Map<string, string>(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
	return {
		store,
		get: async (key: string, type?: string) => {
			const raw = store.get(key) ?? null;
			if (raw === null) return null;
			return type === "json" ? (JSON.parse(raw) as unknown) : raw;
		},
		put: async (key: string, value: string, _options?: { expirationTtl?: number }) => {
			store.set(key, value);
		},
		delete: async (key: string) => {
			store.delete(key);
		},
	};
}

function makeEnv() {
	const kv = memoryKv({
		[CONFIG_KEYS.auth]: { accessKey: "key", secretKey: "secret" },
		[CONFIG_KEYS.passkeys]: [],
	});
	return { env: { EDGE_CONFIG: kv } as unknown as Env, kv };
}

async function sessionToken(env: Env): Promise<string> {
	const response = await app.request(
		"/api/auth/login",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ username: "key", password: "secret" }),
		},
		env as never,
	);
	return ((await response.json()) as { data: { token: string } }).data.token;
}

describe("passkey routes", () => {
	it("registers a passkey while signed in, then signs in with it", async () => {
		const { env } = makeEnv();
		const authorization = await sessionToken(env);

		const registrationOptions = await app.request(
			"/api/auth/passkey/register/options",
			{ method: "POST", headers: { Authorization: authorization } },
			env as never,
		);
		expect(registrationOptions.status).toBe(200);
		const created = (await registrationOptions.json()) as {
			data: { challenge_id: string; options: { challenge: string } };
		};
		const fixture = await makeFixture({
			rpId: "localhost",
			origin: "http://localhost",
			challenge: created.data.options.challenge,
		});

		const registered = await app.request(
			"/api/auth/passkey/register",
			{
				method: "POST",
				headers: { "content-type": "application/json", Authorization: authorization },
				body: JSON.stringify({
					challenge_id: created.data.challenge_id,
					credential: fixture.registration,
					name: "Laptop",
				}),
			},
			env as never,
		);
		expect(registered.status).toBe(200);
		const passkey = (await registered.json()) as { data: { id: string; name: string } };
		expect(passkey.data.name).toBe("Laptop");

		const loginOptions = await app.request("/api/auth/passkey/login/options", { method: "POST" }, env as never);
		expect(loginOptions.status).toBe(200);
		const challenge = (await loginOptions.json()) as {
			data: { challenge_id: string; options: { challenge: string; allowCredentials: { id: string }[] } };
		};
		expect(challenge.data.options.allowCredentials[0].id).toBe(passkey.data.id);

		const assertion = await makeAssertion(fixture, {
			rpId: "localhost",
			origin: "http://localhost",
			challenge: challenge.data.options.challenge,
		});
		const signedIn = await app.request(
			"/api/auth/passkey/login",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ challenge_id: challenge.data.challenge_id, credential: assertion }),
			},
			env as never,
		);
		expect(signedIn.status).toBe(200);
		const body = (await signedIn.json()) as { data: { token: string } };
		expect(typeof body.data.token).toBe("string");

		const me = await app.request("/api/me", { headers: { Authorization: body.data.token } }, env as never);
		expect(me.status).toBe(200);
	});

	it("refuses a challenge that has already been used", async () => {
		const { env } = makeEnv();
		const authorization = await sessionToken(env);
		const options = await app.request(
			"/api/auth/passkey/register/options",
			{ method: "POST", headers: { Authorization: authorization } },
			env as never,
		);
		const created = (await options.json()) as { data: { challenge_id: string; options: { challenge: string } } };
		const fixture = await makeFixture({
			rpId: "localhost",
			origin: "http://localhost",
			challenge: created.data.options.challenge,
		});
		const body = JSON.stringify({ challenge_id: created.data.challenge_id, credential: fixture.registration });
		const first = await app.request(
			"/api/auth/passkey/register",
			{ method: "POST", headers: { "content-type": "application/json", Authorization: authorization }, body },
			env as never,
		);
		expect(first.status).toBe(200);
		const second = await app.request(
			"/api/auth/passkey/register",
			{ method: "POST", headers: { "content-type": "application/json", Authorization: authorization }, body },
			env as never,
		);
		expect(second.status).toBe(400);
	});

	it("says there is no passkey instead of offering an empty login", async () => {
		const { env } = makeEnv();
		const response = await app.request("/api/auth/passkey/login/options", { method: "POST" }, env as never);
		expect(response.status).toBe(404);
	});

	it("lists and deletes a credential without exposing its key", async () => {
		const { env, kv } = makeEnv();
		kv.store.set(
			CONFIG_KEYS.passkeys,
			JSON.stringify([
				{
					id: "credential-1",
					public_key: { kty: "EC", crv: "P-256", x: "x", y: "y" },
					counter: 0,
					transports: ["internal"],
					name: "Phone",
					created_at: "2026-01-01T00:00:00.000Z",
				},
			]),
		);
		const authorization = await sessionToken(env);
		const listed = await app.request(
			"/api/auth/passkey/list",
			{ headers: { Authorization: authorization } },
			env as never,
		);
		expect(listed.status).toBe(200);
		const body = (await listed.json()) as { data: { content: Record<string, unknown>[] } };
		expect(body.data.content[0]).toMatchObject({ id: "credential-1", name: "Phone" });
		expect(body.data.content[0].public_key).toBeUndefined();

		const removed = await app.request(
			"/api/auth/passkey/delete",
			{
				method: "POST",
				headers: { "content-type": "application/json", Authorization: authorization },
				body: JSON.stringify({ id: "credential-1" }),
			},
			env as never,
		);
		expect(removed.status).toBe(200);
		expect(JSON.parse(kv.store.get(CONFIG_KEYS.passkeys) ?? "[]")).toEqual([]);
	});

	it("requires a session to register or list passkeys", async () => {
		const { env } = makeEnv();
		const list = await app.request("/api/auth/passkey/list", {}, env as never);
		expect(list.status).toBe(401);
		const options = await app.request("/api/auth/passkey/register/options", { method: "POST" }, env as never);
		expect(options.status).toBe(401);
	});
});

import type { Context } from "hono";
import { createSessionToken, getAuthConfig } from "./auth";
import { CONFIG_KEYS, readConfig, type EdgeListBindings } from "./env";
import { failure, respond } from "./response";

/**
 * Passkeys (WebAuthn) for the one principal this deployment has.
 *
 * The Worker already authenticates a single AK/SK pair. A passkey does not add a
 * second identity — it adds a second *proof* of the same one: the authenticator
 * signs a server challenge, and a valid signature is exchanged for the same HMAC
 * session token the password login issues. That is why nothing else in the
 * Worker changed: `requireAuth` still checks one token shape.
 *
 * Three details are load-bearing:
 *
 * **The challenge is server-side and consumed on use.** It is stored in KV with
 * a short TTL and deleted when consumed, so a captured assertion has no fresh
 * challenge to answer. KV is eventually consistent, so the one-time guarantee is
 * best-effort in the same way the share counter is; the delete normally
 * propagates long before a replay could be useful, and the signed payload is
 * bound to this site and this challenge either way. The challenge id travels
 * separately from the challenge itself, which keeps the browser from choosing
 * what it is asked to sign.
 *
 * **The origin and RP id are checked.** A passkey is scoped to a site; accepting
 * an assertion made for another origin would turn any website into a way into
 * this one. Both are derived from the request URL rather than configuration,
 * because a deployment's hostname is the thing the browser actually attests.
 *
 * **Attestation is not verified.** This is a self-hosted single-user app, not a
 * bank: the goal is proof that the caller still holds the private key that was
 * registered while signed in, not a statement about the authenticator's
 * manufacturer. The signature on every login is verified in full.
 */

const CHALLENGE_PREFIX = "passkey:challenge:";
const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_TTL_MS = CHALLENGE_TTL_SECONDS * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type PasskeyContext = Context<{ Bindings: Env & EdgeListBindings }>;

/** A registered credential. The public key is kept as JWK coordinates. */
export interface PasskeyRecord {
	id: string;
	public_key: { kty: "EC"; crv: "P-256"; x: string; y: string };
	counter: number;
	transports: string[];
	name: string;
	created_at: string;
	last_used_at?: string;
	backed_up?: boolean;
}

interface RegistrationResponse {
	id?: string;
	rawId?: string;
	response?: {
		clientDataJSON?: string;
		attestationObject?: string;
		transports?: string[];
	};
}

interface AuthenticationResponse {
	id?: string;
	rawId?: string;
	response?: {
		clientDataJSON?: string;
		authenticatorData?: string;
		signature?: string;
	};
}

/** A verification failure with the HTTP status the handler should answer. */
export class PasskeyError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "PasskeyError";
	}
}

/* ------------------------------------------------------------------- encoding */

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

function concat(...parts: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", value));
}

/* ---------------------------------------------------------------------- CBOR */

type CborValue = number | string | Uint8Array | boolean | null | CborValue[] | Map<unknown, CborValue>;

/**
 * A minimal CBOR reader, enough for WebAuthn.
 *
 * WebAuthn hands us two CBOR objects — the attestation object and the COSE
 * credential key — and a full decoder would be a dependency for a dozen fields
 * that are never read. This understands the major types those objects use and
 * leaves tags, floats and indefinite lengths unsupported on purpose.
 */
function readCbor(bytes: Uint8Array, offset = 0): { value: CborValue; next: number } {
	if (offset >= bytes.length) throw new PasskeyError("Truncated passkey data");
	const initial = bytes[offset];
	const major = initial >> 5;
	const info = initial & 0x1f;
	let cursor = offset + 1;
	let length = info;

	if (info === 24) {
		length = bytes[cursor];
		cursor += 1;
	} else if (info === 25) {
		length = (bytes[cursor] << 8) | bytes[cursor + 1];
		cursor += 2;
	} else if (info === 26) {
		length = ((bytes[cursor] << 24) | (bytes[cursor + 1] << 16) | (bytes[cursor + 2] << 8) | bytes[cursor + 3]) >>> 0;
		cursor += 4;
	} else if (info === 27) {
		length = Number(
			(BigInt(bytes[cursor]) << 56n) |
				(BigInt(bytes[cursor + 1]) << 48n) |
				(BigInt(bytes[cursor + 2]) << 40n) |
				(BigInt(bytes[cursor + 3]) << 32n) |
				(BigInt(bytes[cursor + 4]) << 24n) |
				(BigInt(bytes[cursor + 5]) << 16n) |
				(BigInt(bytes[cursor + 6]) << 8n) |
				BigInt(bytes[cursor + 7]),
		);
		cursor += 8;
	} else if (info >= 28) {
		throw new PasskeyError("Unsupported passkey encoding");
	}

	switch (major) {
		case 0:
			return { value: length, next: cursor };
		case 1:
			return { value: -1 - length, next: cursor };
		case 2: {
			if (cursor + length > bytes.length) throw new PasskeyError("Truncated passkey data");
			return { value: bytes.slice(cursor, cursor + length), next: cursor + length };
		}
		case 3: {
			if (cursor + length > bytes.length) throw new PasskeyError("Truncated passkey data");
			return { value: decoder.decode(bytes.slice(cursor, cursor + length)), next: cursor + length };
		}
		case 4: {
			const value: CborValue[] = [];
			for (let index = 0; index < length; index += 1) {
				const item = readCbor(bytes, cursor);
				value.push(item.value);
				cursor = item.next;
			}
			return { value, next: cursor };
		}
		case 5: {
			const value = new Map<unknown, CborValue>();
			for (let index = 0; index < length; index += 1) {
				const key = readCbor(bytes, cursor);
				const item = readCbor(bytes, key.next);
				value.set(key.value, item.value);
				cursor = item.next;
			}
			return { value, next: cursor };
		}
		case 6: {
			// A tag is metadata around a value; the value itself is what is read.
			return readCbor(bytes, cursor);
		}
		case 7:
			if (info === 20) return { value: false, next: cursor };
			if (info === 21) return { value: true, next: cursor };
			if (info === 22) return { value: null, next: cursor };
			throw new PasskeyError("Unsupported passkey encoding");
	}
	throw new PasskeyError("Unsupported passkey encoding");
}

/* ------------------------------------------------------------- authenticator */

interface AuthenticatorData {
	flags: number;
	counter: number;
	credentialId?: Uint8Array;
	coseKey?: CborValue;
}

function parseAuthenticatorData(bytes: Uint8Array): AuthenticatorData {
	if (bytes.length < 37) throw new PasskeyError("Invalid authenticator data");
	const flags = bytes[32];
	const counter = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(33);
	if ((flags & 0x40) === 0) return { flags, counter };

	// An attested credential: AAGUID (16), credential id length (2), the id, then
	// the COSE key at an offset only its own length can find.
	if (bytes.length < 55) throw new PasskeyError("Invalid authenticator data");
	const credentialIdLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(53);
	const credentialId = bytes.slice(55, 55 + credentialIdLength);
	const { value } = readCbor(bytes, 55 + credentialIdLength);
	return { flags, counter, credentialId, coseKey: value };
}

function coseToJwk(value: CborValue): PasskeyRecord["public_key"] {
	if (!(value instanceof Map)) throw new PasskeyError("Invalid credential public key");
	const kty = value.get(1);
	const alg = value.get(3);
	const crv = value.get(-1);
	const x = value.get(-2);
	const y = value.get(-3);
	if (
		kty !== 2 ||
		alg !== -7 ||
		crv !== 1 ||
		!(x instanceof Uint8Array) ||
		!(y instanceof Uint8Array) ||
		x.length !== 32 ||
		y.length !== 32
	) {
		throw new PasskeyError("Unsupported passkey algorithm; use an ES256 passkey");
	}
	return { kty: "EC", crv: "P-256", x: base64url(x), y: base64url(y) };
}

interface ClientData {
	type: string;
	challenge: string;
	origin: string;
}

function parseClientData(value: string | undefined): ClientData {
	if (!value) throw new PasskeyError("The passkey response is missing its client data");
	let parsed: unknown;
	try {
		parsed = JSON.parse(decoder.decode(fromBase64url(value)));
	} catch {
		throw new PasskeyError("Invalid passkey client data");
	}
	const data = parsed as Partial<ClientData>;
	if (typeof data.type !== "string" || typeof data.challenge !== "string" || typeof data.origin !== "string") {
		throw new PasskeyError("Invalid passkey client data");
	}
	return { type: data.type, challenge: data.challenge, origin: data.origin };
}

function checkClientData(data: ClientData, expected: { type: string; challenge: string; origin: string }) {
	if (data.type !== expected.type) throw new PasskeyError("Invalid passkey ceremony");
	if (data.challenge !== expected.challenge) throw new PasskeyError("The passkey challenge did not match");
	if (data.origin !== expected.origin) throw new PasskeyError("The passkey was created for another site");
}

/**
 * Converts the DER signature a WebAuthn ES256 assertion carries into the raw
 * `r || s` form WebCrypto verifies.
 *
 * The two formats encode the same pair of integers; only the wrapper differs.
 * A client that already sends 64 raw bytes is accepted as-is.
 */
export function derToRaw(signature: Uint8Array): Uint8Array {
	if (signature.length === 64) return signature;
	if (signature[0] !== 0x30) throw new PasskeyError("Unsupported signature encoding");
	let offset = 1;
	let length = signature[offset];
	offset += 1;
	if (length & 0x80) {
		const count = length & 0x7f;
		length = 0;
		for (let index = 0; index < count; index += 1) {
			length = (length << 8) | signature[offset];
			offset += 1;
		}
	}
	if (offset + length > signature.length || signature[offset] !== 0x02) {
		throw new PasskeyError("Unsupported signature encoding");
	}
	offset += 1;
	const rLength = signature[offset];
	offset += 1;
	const r = trimLeadingZeros(signature.slice(offset, offset + rLength));
	offset += rLength;
	if (signature[offset] !== 0x02) throw new PasskeyError("Unsupported signature encoding");
	offset += 1;
	const sLength = signature[offset];
	offset += 1;
	const s = trimLeadingZeros(signature.slice(offset, offset + sLength));
	if (r.length > 32 || s.length > 32) throw new PasskeyError("Unsupported signature encoding");
	const raw = new Uint8Array(64);
	raw.set(r, 32 - r.length);
	raw.set(s, 64 - s.length);
	return raw;
}

function trimLeadingZeros(value: Uint8Array): Uint8Array {
	let offset = 0;
	while (offset < value.length - 1 && value[offset] === 0) offset += 1;
	return value.slice(offset);
}

/* --------------------------------------------------------------- verification */

/**
 * Verifies a registration response and returns what should be stored.
 *
 * Only the credential public key and its id matter: the attestation statement is
 * intentionally ignored (see the module comment), while the RP id hash, the
 * user-presence flag and the client data are all checked.
 */
export async function verifyRegistrationResponse(
	response: RegistrationResponse,
	expected: { challenge: string; origin: string; rpId: string },
): Promise<{
	id: string;
	public_key: PasskeyRecord["public_key"];
	counter: number;
	transports: string[];
	backed_up: boolean;
}> {
	const clientData = parseClientData(response.response?.clientDataJSON);
	checkClientData(clientData, { ...expected, type: "webauthn.create" });
	if (!response.response?.attestationObject) throw new PasskeyError("The passkey response is missing its attestation");

	const attestation = readCbor(fromBase64url(response.response.attestationObject)).value;
	if (!(attestation instanceof Map)) throw new PasskeyError("Invalid attestation object");
	const authData = attestation.get("authData");
	if (!(authData instanceof Uint8Array)) throw new PasskeyError("Invalid attestation object");

	const parsed = parseAuthenticatorData(authData);
	if (base64url(authData.slice(0, 32)) !== base64url(await sha256(encoder.encode(expected.rpId)))) {
		throw new PasskeyError("The passkey was created for another site");
	}
	if ((parsed.flags & 0x01) === 0) throw new PasskeyError("The authenticator did not verify the user");
	if (!parsed.credentialId || parsed.credentialId.length === 0 || parsed.coseKey === undefined) {
		throw new PasskeyError("The passkey response has no credential");
	}

	return {
		id: base64url(parsed.credentialId),
		public_key: coseToJwk(parsed.coseKey),
		counter: parsed.counter,
		transports: Array.isArray(response.response.transports) ? response.response.transports.filter(isString) : [],
		backed_up: (parsed.flags & 0x10) !== 0,
	};
}

/**
 * Verifies an assertion against the stored credential.
 *
 * The signed message is `authenticatorData || SHA-256(clientDataJSON)`, which is
 * what binds the challenge, the origin and the counter to the signature. The
 * counter is compared only when both sides report one — most passkeys use zero,
 * and a strictly increasing check would lock every passkey out.
 */
export async function verifyAuthenticationResponse(
	response: AuthenticationResponse,
	expected: { challenge: string; origin: string; rpId: string },
	credential: PasskeyRecord,
): Promise<{ counter: number; backed_up: boolean }> {
	const clientData = parseClientData(response.response?.clientDataJSON);
	checkClientData(clientData, { ...expected, type: "webauthn.get" });
	if (!response.response?.authenticatorData || !response.response.signature) {
		throw new PasskeyError("The passkey response is missing its signature");
	}

	const authData = fromBase64url(response.response.authenticatorData);
	const parsed = parseAuthenticatorData(authData);
	if (base64url(authData.slice(0, 32)) !== base64url(await sha256(encoder.encode(expected.rpId)))) {
		throw new PasskeyError("The passkey was created for another site");
	}
	if ((parsed.flags & 0x01) === 0) throw new PasskeyError("The authenticator did not verify the user");

	const clientDataHash = await sha256(fromBase64url(response.response.clientDataJSON!));
	let valid = false;
	try {
		const key = await crypto.subtle.importKey(
			"jwk",
			{ ...credential.public_key, ext: true },
			{ name: "ECDSA", namedCurve: "P-256" },
			false,
			["verify"],
		);
		valid = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			key,
			derToRaw(fromBase64url(response.response.signature)),
			concat(authData, clientDataHash),
		);
	} catch {
		throw new PasskeyError("The passkey signature is invalid", 401);
	}
	if (!valid) throw new PasskeyError("The passkey signature is invalid", 401);
	if (credential.counter > 0 && parsed.counter > 0 && parsed.counter <= credential.counter) {
		throw new PasskeyError("This passkey may have been cloned", 401);
	}
	return { counter: parsed.counter, backed_up: (parsed.flags & 0x10) !== 0 };
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

/* --------------------------------------------------------------------- store */

async function readPasskeys(kv: KVNamespace): Promise<PasskeyRecord[]> {
	const value = await readConfig(kv, CONFIG_KEYS.passkeys);
	if (!Array.isArray(value)) return [];
	return (value as PasskeyRecord[]).filter(
		(item) => item && typeof item === "object" && typeof item.id === "string" && item.public_key,
	);
}

async function writePasskeys(kv: KVNamespace, passkeys: PasskeyRecord[]) {
	await kv.put(CONFIG_KEYS.passkeys, JSON.stringify(passkeys));
}

function passkeyView(record: PasskeyRecord) {
	return {
		id: record.id,
		name: record.name,
		created_at: record.created_at,
		last_used_at: record.last_used_at ?? "",
		backed_up: record.backed_up === true,
		transports: record.transports,
	};
}

/**
 * The site a passkey belongs to.
 *
 * Derived from the request rather than a setting: the browser hashes the
 * hostname it was served from, so that is the only RP id an assertion can be
 * made for. A deployment reached at two hostnames therefore has two passkey
 * scopes, which is WebAuthn's rule, not a choice made here.
 */
function relyingParty(c: PasskeyContext): { origin: string; rpId: string } {
	const url = new URL(c.req.url);
	return { origin: url.origin, rpId: url.hostname };
}

/* ---------------------------------------------------------------- challenges */

interface StoredChallenge {
	challenge: string;
	kind: "register" | "login";
	expires: number;
}

async function createChallenge(kv: KVNamespace, kind: StoredChallenge["kind"]) {
	const id = base64url(crypto.getRandomValues(new Uint8Array(16)));
	const challenge = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const record: StoredChallenge = { challenge, kind, expires: Date.now() + CHALLENGE_TTL_MS };
	// `expirationTtl` is the real expiry; `expires` is also checked on read so a
	// KV that kept the value past its TTL still cannot be replayed.
	await kv.put(`${CHALLENGE_PREFIX}${id}`, JSON.stringify(record), { expirationTtl: CHALLENGE_TTL_SECONDS });
	return { id, challenge };
}

async function consumeChallenge(kv: KVNamespace, id: string, kind: StoredChallenge["kind"]): Promise<string | null> {
	if (!id) return null;
	const key = `${CHALLENGE_PREFIX}${id}`;
	const record = await kv.get<StoredChallenge>(key, "json");
	// Single use: consume it even when it turns out to be expired or of the wrong
	// kind, so a failed attempt cannot be retried with the same challenge.
	await kv.delete(key);
	if (!record || record.kind !== kind || record.expires < Date.now()) return null;
	return record.challenge;
}

/* ------------------------------------------------------------------ handlers */

/** `POST /api/auth/passkey/login/options` — the challenge a passkey signs. */
export async function passkeyLoginOptions(c: PasskeyContext) {
	const passkeys = await readPasskeys(c.env.EDGE_CONFIG);
	if (passkeys.length === 0) return failure("No passkey has been registered for this deployment", 404);
	const { rpId } = relyingParty(c);
	const { id, challenge } = await createChallenge(c.env.EDGE_CONFIG, "login");
	return respond(c, {
		challenge_id: id,
		options: {
			challenge,
			rpId,
			timeout: 60_000,
			userVerification: "preferred",
			allowCredentials: passkeys.map((passkey) => ({
				type: "public-key",
				id: passkey.id,
				transports: passkey.transports,
			})),
		},
	});
}

/** `POST /api/auth/passkey/login` — a signed challenge becomes a session. */
export async function passkeyLogin(c: PasskeyContext) {
	try {
		const input = await c.req.json<{ challenge_id?: string; credential?: AuthenticationResponse }>();
		if (!input.credential?.response) return failure("The passkey response is missing", 400);
		const challenge = await consumeChallenge(c.env.EDGE_CONFIG, input.challenge_id ?? "", "login");
		if (!challenge) return failure("The sign-in request expired, please try again", 400);

		const passkeys = await readPasskeys(c.env.EDGE_CONFIG);
		const id = input.credential.rawId ?? input.credential.id ?? "";
		const index = passkeys.findIndex((passkey) => passkey.id === id);
		if (index === -1) return failure("This passkey is not registered", 404);

		const { origin, rpId } = relyingParty(c);
		const result = await verifyAuthenticationResponse(input.credential, { challenge, origin, rpId }, passkeys[index]);
		passkeys[index] = {
			...passkeys[index],
			counter: result.counter > 0 ? result.counter : passkeys[index].counter,
			last_used_at: new Date().toISOString(),
			backed_up: result.backed_up,
		};
		await writePasskeys(c.env.EDGE_CONFIG, passkeys);

		const config = await getAuthConfig(c.env.EDGE_CONFIG);
		if (!config) return failure("Authentication is not configured", 500);
		return respond(c, { token: await createSessionToken(config) });
	} catch (error) {
		if (error instanceof PasskeyError) return failure(error.message, error.status);
		return failure(error instanceof Error ? error.message : "Passkey sign-in failed", 400);
	}
}

/** `POST /api/auth/passkey/register/options` — the challenge to create against. */
export async function passkeyRegisterOptions(c: PasskeyContext) {
	const config = await getAuthConfig(c.env.EDGE_CONFIG);
	if (!config) return failure("Authentication is not configured", 500);
	const passkeys = await readPasskeys(c.env.EDGE_CONFIG);
	const { rpId } = relyingParty(c);
	const { id, challenge } = await createChallenge(c.env.EDGE_CONFIG, "register");
	// A stable 32-byte user handle derived from the access key. It names the same
	// principal on every registration, which is what lets a discoverable passkey
	// find this account without a username.
	const userId = base64url(await sha256(encoder.encode(config.accessKey)));
	return respond(c, {
		challenge_id: id,
		options: {
			challenge,
			rp: { id: rpId, name: "EdgeList" },
			user: { id: userId, name: config.accessKey, displayName: config.accessKey },
			pubKeyCredParams: [{ type: "public-key", alg: -7 }],
			timeout: 60_000,
			attestation: "none",
			authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
			excludeCredentials: passkeys.map((passkey) => ({
				type: "public-key",
				id: passkey.id,
				transports: passkey.transports,
			})),
		},
	});
}

/** `POST /api/auth/passkey/register` — store a newly created credential. */
export async function passkeyRegister(c: PasskeyContext) {
	try {
		const input = await c.req.json<{ challenge_id?: string; name?: string; credential?: RegistrationResponse }>();
		if (!input.credential?.response) return failure("The passkey response is missing", 400);
		const challenge = await consumeChallenge(c.env.EDGE_CONFIG, input.challenge_id ?? "", "register");
		if (!challenge) return failure("The registration request expired, please try again", 400);

		const { origin, rpId } = relyingParty(c);
		const result = await verifyRegistrationResponse(input.credential, { challenge, origin, rpId });
		const passkeys = await readPasskeys(c.env.EDGE_CONFIG);
		if (passkeys.some((passkey) => passkey.id === result.id)) {
			return failure("This passkey is already registered", 409);
		}
		const record: PasskeyRecord = {
			id: result.id,
			public_key: result.public_key,
			counter: result.counter,
			transports: result.transports,
			name: (input.name ?? "").trim().slice(0, 80) || `Passkey ${passkeys.length + 1}`,
			created_at: new Date().toISOString(),
			backed_up: result.backed_up,
		};
		passkeys.push(record);
		await writePasskeys(c.env.EDGE_CONFIG, passkeys);
		return respond(c, passkeyView(record));
	} catch (error) {
		if (error instanceof PasskeyError) return failure(error.message, error.status);
		return failure(error instanceof Error ? error.message : "Unable to register the passkey", 400);
	}
}

/** `GET /api/auth/passkey/list` — the credentials on this deployment. */
export async function passkeyList(c: PasskeyContext) {
	const passkeys = await readPasskeys(c.env.EDGE_CONFIG);
	return respond(c, { content: passkeys.map(passkeyView), total: passkeys.length });
}

/** `POST /api/auth/passkey/delete` — remove one credential by id. */
export async function passkeyDelete(c: PasskeyContext) {
	try {
		const input = await c.req.json<{ id?: string }>();
		const id = (input.id ?? "").trim();
		if (!id) return failure("A passkey id is required", 400);
		const passkeys = await readPasskeys(c.env.EDGE_CONFIG);
		const index = passkeys.findIndex((passkey) => passkey.id === id);
		if (index === -1) return failure("Passkey not found", 404);
		passkeys.splice(index, 1);
		await writePasskeys(c.env.EDGE_CONFIG, passkeys);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to delete the passkey", 400);
	}
}

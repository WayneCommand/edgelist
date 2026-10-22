/**
 * The browser half of passkeys.
 *
 * The server sends WebAuthn options with base64url strings; the Credential
 * Management API wants `ArrayBuffer`s and returns them. This module is the only
 * place that conversion happens, for both registration and sign-in, so the
 * components deal in plain JSON and never touch a buffer.
 */

export type PasskeyCreationOptionsJSON = {
	challenge: string;
	rp: { id: string; name: string };
	user: { id: string; name: string; displayName: string };
	pubKeyCredParams: Array<{ type: "public-key"; alg: number }>;
	timeout?: number;
	attestation?: AttestationConveyancePreference;
	authenticatorSelection?: {
		authenticatorAttachment?: AuthenticatorAttachment;
		residentKey?: ResidentKeyRequirement;
		requireResidentKey?: boolean;
		userVerification?: UserVerificationRequirement;
	};
	excludeCredentials?: Array<{ type: "public-key"; id: string; transports?: AuthenticatorTransport[] }>;
};

export type PasskeyRequestOptionsJSON = {
	challenge: string;
	rpId: string;
	timeout?: number;
	userVerification?: UserVerificationRequirement;
	allowCredentials?: Array<{ type: "public-key"; id: string; transports?: AuthenticatorTransport[] }>;
};

export type PasskeyRegistrationPayload = {
	id: string;
	rawId: string;
	type: string;
	response: {
		clientDataJSON: string;
		attestationObject: string;
		transports: string[];
	};
};

export type PasskeyAuthenticationPayload = {
	id: string;
	rawId: string;
	type: string;
	response: {
		clientDataJSON: string;
		authenticatorData: string;
		signature: string;
		userHandle: string | null;
	};
};

/** Why a passkey prompt could not finish, in terms the UI can translate. */
export type PasskeyFailure = "unsupported" | "cancelled" | "insecure" | "failed";

export class PasskeyClientError extends Error {
	constructor(
		readonly code: PasskeyFailure,
		message: string,
	) {
		super(message);
		this.name = "PasskeyClientError";
	}
}

/**
 * Whether this browser can run either ceremony.
 *
 * Checked before showing the button rather than only on failure: a browser
 * without WebAuthn would otherwise offer a control whose only outcome is an
 * error, and an insecure origin is the common reason on a self-hosted LAN
 * address. `isSecureContext` covers the latter without waiting for a throw.
 */
export function passkeysAvailable(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.PublicKeyCredential !== "undefined" &&
		typeof navigator.credentials?.create === "function" &&
		typeof navigator.credentials?.get === "function"
	);
}

export function passkeysSecure(): boolean {
	return typeof window === "undefined" || window.isSecureContext !== false;
}

/** Runs `navigator.credentials.create` and returns plain JSON for the Worker. */
export async function createPasskey(options: PasskeyCreationOptionsJSON): Promise<PasskeyRegistrationPayload> {
	requireSupport();
	try {
		const credential = (await navigator.credentials.create({
			publicKey: {
				...options,
				challenge: fromBase64url(options.challenge),
				user: { ...options.user, id: fromBase64url(options.user.id) },
				excludeCredentials: options.excludeCredentials?.map((entry) => ({
					...entry,
					id: fromBase64url(entry.id),
				})),
			},
		})) as PublicKeyCredential | null;
		if (!credential) throw new PasskeyClientError("cancelled", "No passkey was created");
		const response = credential.response as AuthenticatorAttestationResponse;
		return {
			id: credential.id,
			rawId: base64url(new Uint8Array(credential.rawId)),
			type: credential.type,
			response: {
				clientDataJSON: base64url(new Uint8Array(response.clientDataJSON)),
				attestationObject: base64url(new Uint8Array(response.attestationObject)),
				transports: response.getTransports?.() ?? [],
			},
		};
	} catch (error) {
		throw asPasskeyError(error);
	}
}

/** Runs `navigator.credentials.get` and returns plain JSON for the Worker. */
export async function getPasskey(options: PasskeyRequestOptionsJSON): Promise<PasskeyAuthenticationPayload> {
	requireSupport();
	try {
		const credential = (await navigator.credentials.get({
			publicKey: {
				...options,
				challenge: fromBase64url(options.challenge),
				allowCredentials: options.allowCredentials?.map((entry) => ({
					...entry,
					id: fromBase64url(entry.id),
				})),
			},
		})) as PublicKeyCredential | null;
		if (!credential) throw new PasskeyClientError("cancelled", "No passkey was returned");
		const response = credential.response as AuthenticatorAssertionResponse;
		return {
			id: credential.id,
			rawId: base64url(new Uint8Array(credential.rawId)),
			type: credential.type,
			response: {
				clientDataJSON: base64url(new Uint8Array(response.clientDataJSON)),
				authenticatorData: base64url(new Uint8Array(response.authenticatorData)),
				signature: base64url(new Uint8Array(response.signature)),
				userHandle: response.userHandle ? base64url(new Uint8Array(response.userHandle)) : null,
			},
		};
	} catch (error) {
		throw asPasskeyError(error);
	}
}

function requireSupport() {
	if (!passkeysAvailable()) throw new PasskeyClientError("unsupported", "This browser does not support passkeys");
	if (!passkeysSecure()) throw new PasskeyClientError("insecure", "Passkeys require a secure origin");
}

/**
 * Maps the DOM's own failures to the three cases a person can act on.
 *
 * `NotAllowedError` is what both a dismissed prompt and a timed-out one look
 * like, and there is no more specific information to be had — so it is
 * "cancelled" rather than an error the page can explain further.
 */
function asPasskeyError(error: unknown): PasskeyClientError {
	if (error instanceof PasskeyClientError) return error;
	if (error instanceof DOMException) {
		if (error.name === "NotAllowedError" || error.name === "AbortError") {
			return new PasskeyClientError("cancelled", error.message);
		}
		if (error.name === "SecurityError") return new PasskeyClientError("insecure", error.message);
		if (error.name === "NotSupportedError") return new PasskeyClientError("unsupported", error.message);
	}
	return new PasskeyClientError("failed", error instanceof Error ? error.message : "The passkey failed");
}

function base64url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
	const padded = value
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

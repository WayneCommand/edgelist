import { clearAuthToken, getAuthToken } from "../hooks/useAuth";

type ApiEnvelope<T> = { code?: number; message?: string; data?: T };

/**
 * A failed API call, carrying the status that produced it.
 *
 * The status is what lets a caller tell a refusal from a blip: a 403 will say
 * the same thing however many times it is asked, while a 502 or a dropped
 * connection may not. It extends `Error` so every existing `instanceof Error`
 * check keeps working unchanged.
 */
export class ApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

/**
 * Talks to the OpenList-compatible Worker API. A 401 clears the session so the
 * router can bounce the user back to the sign-in page.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
		headers.set("content-type", "application/json");
	}
	headers.set("Authorization", getAuthToken());
	const response = await fetch(path, { ...init, headers });
	if (response.status === 401) clearAuthToken();
	const result = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
	if (!response.ok || result.code !== 200) {
		// `failure()` on the worker sets the body's `code` and the HTTP status to
		// the same number, so the transport status is a faithful signal either way.
		throw new ApiError(result.message || `Request failed (${response.status})`, response.status);
	}
	return result.data as T;
}

/**
 * Reads a file's bytes from `/d/*`.
 *
 * That route is authenticated like every other one, so it cannot be pointed at
 * from an `<img>` or `<video>` — the browser sends no `Authorization` header for
 * a subresource. Everything that shows or saves a file goes through here and
 * turns the response into an object URL instead.
 */
export async function fetchFileResponse(path: string): Promise<Response> {
	const headers = new Headers();
	headers.set("Authorization", getAuthToken());
	const response = await fetch(`/d${path}`, { headers });
	if (response.status === 401) clearAuthToken();
	if (!response.ok) {
		const name = path.split("/").pop() ?? "file";
		throw new Error(`Unable to read ${name} (${response.status})`);
	}
	return response;
}

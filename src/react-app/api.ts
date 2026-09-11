import { clearAuthToken, getAuthToken } from "./hooks/useAuth";

type ApiEnvelope<T> = { code?: number; message?: string; data?: T };

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
		throw new Error(result.message || `Request failed (${response.status})`);
	}
	return result.data as T;
}

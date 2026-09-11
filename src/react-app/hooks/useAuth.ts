import { useSyncExternalStore } from "react";

const TOKEN_KEY = "edgelist-token";

let token = sessionStorage.getItem(TOKEN_KEY) ?? "";
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getAuthToken() {
	return token;
}

export function setAuthToken(next: string) {
	token = next;
	sessionStorage.setItem(TOKEN_KEY, next);
	emit();
}

export function clearAuthToken() {
	token = "";
	sessionStorage.removeItem(TOKEN_KEY);
	emit();
}

/**
 * The session token lives in `sessionStorage`, but React needs to re-render
 * when it changes, so it is mirrored in a tiny external store.
 */
export function useAuth() {
	const current = useSyncExternalStore(subscribe, getAuthToken, () => "");
	return {
		token: current,
		signedIn: Boolean(current),
		signIn: setAuthToken,
		signOut: clearAuthToken,
	};
}

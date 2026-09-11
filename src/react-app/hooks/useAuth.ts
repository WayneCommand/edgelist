import { useSyncExternalStore } from "react";

const TOKEN_KEY = "edgelist-token";

// `sessionStorage` is missing outside a browser (tests, SSR) and throws when it
// is present but blocked (private mode, storage disabled), so every access goes
// through here rather than being read once at module load. The in-memory mirror
// below keeps the session working either way.
function readStoredToken(): string {
	try {
		return sessionStorage.getItem(TOKEN_KEY) ?? "";
	} catch {
		return "";
	}
}

function writeStoredToken(value: string | null) {
	try {
		if (value === null) sessionStorage.removeItem(TOKEN_KEY);
		else sessionStorage.setItem(TOKEN_KEY, value);
	} catch {
		// Nothing to do: the token still lives in memory for this session.
	}
}

let token = readStoredToken();
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
	writeStoredToken(next);
	emit();
}

export function clearAuthToken() {
	token = "";
	writeStoredToken(null);
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

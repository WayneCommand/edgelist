/**
 * The Worker's API, as typed calls.
 *
 * This is the *only* module that knows a URL. Everything above it deals in
 * domain types, which is what keeps the UI and the Worker independent: the
 * Worker owns OpenList-shaped envelopes and endpoint paths, and a change there
 * lands in this file and nowhere else.
 *
 * Three details of the transport matter and are worth stating once:
 *
 * **Every response is an OpenList envelope.** `{ code, message, data }`, and
 * `code === 200` means the call worked. A failure carries the same shape with an
 * HTTP status to match, so the status and the body agree and either can be read.
 *
 * **A 401 clears the session.** The token is in the store below, so a rejected
 * token drops the caller back to the sign-in screen rather than leaving every
 * subsequent request to fail one at a time.
 *
 * **`/d/*` is authenticated like every other route**, so a file cannot be pointed
 * at from an `<img src>`. Anything that shows or saves a file goes through
 * `readFile`, which turns the response into an object URL or a blob.
 */

import type {
	DirectoryNode,
	FileObject,
	FileList,
	LoginResult,
	MetaRule,
	MeResult,
	MultipartStatus,
	RemoveResult,
	SearchResult,
	StorageConfig,
	StorageList,
	TransferRequest,
	TransferResult,
	DriverInfo,
	BackupData,
	RestoreResult,
} from "./types";
import type {
	PasskeyAuthenticationPayload,
	PasskeyCreationOptionsJSON,
	PasskeyRegistrationPayload,
	PasskeyRequestOptionsJSON,
} from "./passkey";

const TOKEN_KEY = "edgelist:token";

/**
 * The session token.
 *
 * `sessionStorage` rather than `localStorage`: a token that survives a browser
 * restart is a token nobody revoked. Every access is guarded because storage
 * throws when it is blocked (private mode, cookies off) and is absent during
 * tests; the in-memory copy keeps the session usable either way.
 */
function readStoredToken(): string {
	try {
		return sessionStorage.getItem(TOKEN_KEY) ?? "";
	} catch {
		return "";
	}
}

let token = readStoredToken();
const authListeners = new Set<() => void>();

function emitAuth() {
	for (const listener of authListeners) listener();
}

export function getToken(): string {
	return token;
}

export function setToken(next: string) {
	token = next;
	try {
		sessionStorage.setItem(TOKEN_KEY, next);
	} catch {
		// The in-memory copy still works for this session.
	}
	emitAuth();
}

export function clearToken() {
	token = "";
	try {
		sessionStorage.removeItem(TOKEN_KEY);
	} catch {
		// Nothing to do.
	}
	emitAuth();
}

export function subscribeToken(listener: () => void): () => void {
	authListeners.add(listener);
	return () => {
		authListeners.delete(listener);
	};
}

/** A failed call, carrying the status that produced it. */
export class ApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

type Envelope<T> = { code?: number; message?: string; data?: T };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("content-type")) {
		headers.set("content-type", "application/json");
	}
	if (token) headers.set("Authorization", token);
	const response = await fetch(path, { ...init, headers });
	if (response.status === 401) clearToken();
	const body = (await response.json().catch(() => ({}))) as Envelope<T>;
	if (!response.ok || body.code !== 200) {
		throw new ApiError(body.message || `Request failed (${response.status})`, response.status);
	}
	return body.data as T;
}

/** JSON in, JSON out. */
function post<T>(path: string, body?: unknown): Promise<T> {
	return request<T>(path, {
		method: "POST",
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

function query(params: Record<string, string | number | boolean | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		search.set(key, String(value));
	}
	const encoded = search.toString();
	return encoded ? `?${encoded}` : "";
}

/* ------------------------------------------------------------------ session */

export function login(accessKey: string, secretKey: string): Promise<LoginResult> {
	// The unhashed endpoint: TLS plus the Worker's constant-time compare is the
	// security boundary, and hashing client-side would add a JS dependency and a
	// second path for no benefit.
	return post<LoginResult>("/api/auth/login", { access_key: accessKey, secret_key: secretKey });
}

export async function logout(): Promise<void> {
	try {
		await request<null>("/api/auth/logout");
	} finally {
		clearToken();
	}
}

export function fetchMe(): Promise<MeResult> {
	return request<MeResult>("/api/me");
}

/* ------------------------------------------------------------------ passkeys */

/** A credential as the profile lists it — no public key, no secret. */
export type PasskeySummary = {
	id: string;
	name: string;
	created_at: string;
	last_used_at: string;
	backed_up: boolean;
	transports: string[];
};

export type PasskeyOptions<T> = { challenge_id: string; options: T };

/** The challenge a passkey signs during sign-in. Public: no session yet. */
export function passkeyLoginOptions(): Promise<PasskeyOptions<PasskeyRequestOptionsJSON>> {
	return post<PasskeyOptions<PasskeyRequestOptionsJSON>>("/api/auth/passkey/login/options", {});
}

/** Exchanges a signed challenge for the same session token the password gets. */
export function passkeyLogin(challengeId: string, credential: PasskeyAuthenticationPayload): Promise<LoginResult> {
	return post<LoginResult>("/api/auth/passkey/login", { challenge_id: challengeId, credential });
}

/** The challenge a new credential is created against. Requires a session. */
export function passkeyRegisterOptions(): Promise<PasskeyOptions<PasskeyCreationOptionsJSON>> {
	return post<PasskeyOptions<PasskeyCreationOptionsJSON>>("/api/auth/passkey/register/options", {});
}

export function registerPasskey(
	challengeId: string,
	credential: PasskeyRegistrationPayload,
	name?: string,
): Promise<PasskeySummary> {
	return post<PasskeySummary>("/api/auth/passkey/register", { challenge_id: challengeId, credential, name });
}

export function listPasskeys(): Promise<{ content: PasskeySummary[]; total: number }> {
	return request<{ content: PasskeySummary[]; total: number }>("/api/auth/passkey/list");
}

export function deletePasskey(id: string): Promise<null> {
	return post<null>("/api/auth/passkey/delete", { id });
}

/* --------------------------------------------------------------------- files */

export type ListOptions = {
	page?: number;
	/** `0` asks for the whole directory, which is how the Worker spells "no paging". */
	per_page?: number;
	refresh?: boolean;
	order_by?: string;
	order_direction?: string;
};

export function listFiles(path: string, options: ListOptions = {}): Promise<FileList> {
	return post<FileList>("/api/fs/list", { path, ...options });
}

export function getFile(path: string, password?: string): Promise<FileObject> {
	return post<FileObject>("/api/fs/get", { path, password });
}

export function makeDirectory(path: string, createParent = false): Promise<null> {
	return post<null>("/api/fs/mkdir", { path, create_parent: createParent });
}

export function rename(path: string, name: string, overwrite = false): Promise<null> {
	return post<null>("/api/fs/rename", { path, name, overwrite });
}

export function copyPaths(input: TransferRequest): Promise<TransferResult> {
	return post<TransferResult>("/api/fs/copy", input);
}

export function movePaths(input: TransferRequest): Promise<TransferResult> {
	return post<TransferResult>("/api/fs/move", input);
}

export function removePaths(dir: string, names: string[]): Promise<RemoveResult> {
	return post<RemoveResult>("/api/fs/remove", { dir, names });
}

export function removeEmptyDirectories(path: string): Promise<{ removed: string[] }> {
	return post<{ removed: string[] }>("/api/fs/remove_empty_directory", { path });
}

export function searchFiles(input: {
	parent: string;
	keywords: string;
	scope?: number;
	page?: number;
	per_page?: number;
}): Promise<SearchResult> {
	return post<SearchResult>("/api/fs/search", input);
}

export function listDirectories(path: string, depth = 2): Promise<DirectoryNode[]> {
	return post<DirectoryNode[]>("/api/fs/dirs", { path, depth });
}

export function fileLink(path: string): Promise<{ url: string }> {
	return post<{ url: string }>("/api/fs/link", { path });
}

/** Writes a body to `path`. Used for both an upload and an empty new file. */
export async function writeFile(path: string, body: BodyInit, contentType: string): Promise<void> {
	await request<null>("/api/fs/put", {
		method: "PUT",
		headers: {
			// `File-Path` is percent-encoded because a header cannot carry a raw
			// UTF-8 file name reliably; the Worker decodes it.
			"File-Path": encodeURIComponent(path),
			"Content-Type": contentType,
		},
		body,
	});
}

/* ------------------------------------------------------------------ multipart */

export function multipartInit(path: string, size: number): Promise<{ upload_id: string; chunk_size: number }> {
	return post<{ upload_id: string; chunk_size: number }>("/api/fs/multipart/init", { path, size });
}

export async function multipartChunk(uploadId: string, index: number, body: Blob): Promise<void> {
	await request<null>("/api/fs/multipart/chunk", {
		method: "PUT",
		headers: {
			// Named explicitly: these bytes are opaque, and the client would
			// otherwise infer JSON from the presence of a body.
			"Content-Type": "application/octet-stream",
			"X-Upload-Id": uploadId,
			"X-Chunk-Index": String(index),
		},
		body,
	});
}

export function multipartComplete(uploadId: string): Promise<null> {
	return post<null>("/api/fs/multipart/complete", { upload_id: uploadId });
}

export function multipartStatus(uploadId: string): Promise<MultipartStatus> {
	return post<MultipartStatus>("/api/fs/multipart/status", { upload_id: uploadId });
}

export function multipartAbort(uploadId: string): Promise<null> {
	return post<null>("/api/fs/multipart/abort", { upload_id: uploadId });
}

/* --------------------------------------------------------------------- reads */

/**
 * Reads a file's bytes.
 *
 * The response is passed straight through rather than buffered, so a caller that
 * only needs a blob can take one and a caller that wants a stream can have it.
 */
export async function readFile(path: string, range?: string): Promise<Response> {
	const headers = new Headers();
	if (token) headers.set("Authorization", token);
	if (range) headers.set("Range", range);
	const response = await fetch(`/d${encodeURI(path)}`, { headers });
	if (response.status === 401) clearToken();
	if (!response.ok) {
		throw new ApiError(`Unable to read ${path.split("/").pop() ?? "file"} (${response.status})`, response.status);
	}
	return response;
}

/** The absolute URL a file's bytes are served at. Only useful with a token. */
export function fileUrl(path: string): string {
	return new URL(`/d${encodeURI(path)}`, globalThis.location?.origin ?? "https://localhost").href;
}

/* -------------------------------------------------------------------- shares */

export type ShareView = {
	path: string;
	name: string;
	/** The share page, for a person. */
	url: string;
	/** The raw file, for a program or a browser. */
	raw_url: string;
	/** The storage serving this path, recorded when the share was made. */
	storage: { id: number; name: string; mount_path: string };
	remark: string;
	code_required: boolean;
	expires: string;
	views: number;
	max_views: number;
	enabled: boolean;
};

export type ShareState = {
	shared: boolean;
	/** `work`, `disabled`, `expired`, `exhausted` — or absent when not shared. */
	state?: string;
	share: ShareView | null;
};

export function listShares(): Promise<{ content: (ShareView & { state: string })[]; total: number }> {
	return request<{ content: (ShareView & { state: string })[]; total: number }>("/api/share/list");
}

export function shareStateOf(path: string): Promise<ShareState> {
	return post<ShareState>("/api/share/state", { path });
}

export function createShare(input: {
	path: string;
	code?: string;
	expires?: string;
	max_views?: number;
	remark?: string;
}): Promise<ShareView> {
	return post<ShareView>("/api/share/create", input);
}

export function updateShare(input: {
	path: string;
	enabled?: boolean;
	code?: string;
	expires?: string;
	max_views?: number;
	remark?: string;
}): Promise<ShareView> {
	return post<ShareView>("/api/share/update", input);
}

export function deleteShare(path: string): Promise<null> {
	return post<null>("/api/share/delete", { path });
}

/* -------------------------------------------------------------------- admin */

export function listStorages(): Promise<StorageList> {
	return request<StorageList>("/api/admin/storage/list");
}

export function getStorage(id: number): Promise<StorageConfig> {
	return request<StorageConfig>(`/api/admin/storage/get${query({ id })}`);
}

/** Create and update are the same write; `id` is what decides which. */
export function saveStorage(storage: StorageConfig): Promise<null> {
	const path = storage.id > 0 ? "/api/admin/storage/update" : "/api/admin/storage/create";
	return post<null>(path, storage);
}

export function deleteStorage(id: number): Promise<null> {
	return post<null>("/api/admin/storage/delete", { id });
}

export function setStorageEnabled(id: number, enabled: boolean): Promise<null> {
	return post<null>(`/api/admin/storage/${enabled ? "enable" : "disable"}${query({ id })}`);
}

export function reloadStorages(): Promise<null> {
	return post<null>("/api/admin/storage/load_all");
}

export function listDrivers(): Promise<DriverInfo[]> {
	return request<DriverInfo[]>("/api/admin/driver/list");
}

export function listMetas(): Promise<{ content: MetaRule[]; total: number }> {
	return request<{ content: MetaRule[]; total: number }>("/api/admin/meta/list");
}

export function saveMeta(rule: MetaRule): Promise<null> {
	// The Worker exposes create and update separately but writes them the same
	// way; `id` at zero is a create on both routes, so one call covers both.
	return post<null>(rule.id > 0 ? "/api/admin/meta/update" : "/api/admin/meta/create", rule);
}

export function deleteMeta(id: number): Promise<null> {
	return post<null>("/api/admin/meta/delete", { id });
}

/**
 * Exports an OpenList-compatible backup.
 *
 * Returns the raw response rather than parsed JSON: the Worker answers with a
 * `content-disposition` attachment, and the browser download is the point.
 */
export async function exportBackup(password: string): Promise<Response> {
	const headers = new Headers({ "content-type": "application/json" });
	if (token) headers.set("Authorization", token);
	const response = await fetch("/api/admin/backup/export", {
		method: "POST",
		headers,
		body: JSON.stringify({ password }),
	});
	if (response.status === 401) clearToken();
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { message?: string };
		throw new ApiError(body.message ?? "Backup failed", response.status);
	}
	return response;
}

export function restoreBackup(
	data: BackupData,
	options: { password: string; override: boolean },
): Promise<RestoreResult> {
	return post<RestoreResult>("/api/admin/backup/restore", {
		password: options.password,
		override: options.override,
		data,
	});
}

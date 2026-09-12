export type StorageDriver = "openlist" | "object" | "webdav";

export type StorageCapability =
	| "read"
	| "write"
	| "mkdir"
	| "remove"
	| "rename"
	| "copy"
	| "move"
	| "merge"
	/**
	 * The driver can split a large upload into parts it reassembles itself.
	 * Only an object store can: the parts have to be combined server-side, which
	 * is what S3's `CompleteMultipartUpload` does and what neither WebDAV nor a
	 * proxied OpenList can offer.
	 */
	| "multipart";

export interface StorageConfig {
	id: number;
	mount_path: string;
	order: number;
	driver: StorageDriver;
	status: string;
	addition: string;
	remark: string;
	disabled: boolean;
	/** Set on every save; virtual directories report it as their modified time. */
	modified?: string;
	extract_folder?: string;
	/**
	 * Minutes a cached directory listing stays fresh. Mirrors OpenList's
	 * `Storage.CacheExpiration` (`internal/model/storage.go:13`), which is a
	 * required number defaulting to 30.
	 */
	cache_expiration?: number;
	/** Newline separated `pattern:minutes` rules, matched with doublestar globs. */
	custom_cache_policies?: string;
	[key: string]: unknown;
}

// Mirrors OpenList's `ObjMask` (`internal/model/obj.go:239-257`). The file list
// ships these bits so a client can grey out the actions an entry cannot do.
export const ObjMask = {
	Virtual: 1 << 0,
	NoRename: 1 << 1,
	NoRemove: 1 << 2,
	NoMove: 1 << 3,
	NoCopy: 1 << 4,
	NoWrite: 1 << 5,
	Temp: 1 << 6,
} as const;

// A mount point exists because a storage is mounted there: you cannot rename,
// remove or move it, only write through it.
export const OBJ_LOCKED = ObjMask.NoRename | ObjMask.NoRemove | ObjMask.NoMove;

// Intermediate directories only exist to reach a nested mount, so they are
// locked as well and cannot be written into.
export const OBJ_READ_ONLY = OBJ_LOCKED | ObjMask.NoWrite;

export interface FileObject {
	name: string;
	size: number;
	is_dir: boolean;
	modified: string;
	created: string;
	path: string;
	/** OpenList `ObjMask` bits; 0 means every action is allowed. */
	mask?: number;
	/** Driver key that serves this entry: `object`, `webdav` or `openlist`. */
	provider?: string;
	hashinfo?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ListOptions {
	page: number;
	per_page: number;
	refresh: boolean;
}

/**
 * OpenList's default for `cache_expiration`, in minutes
 * (`internal/op/driver.go:76-82`). It is the value both the registry offers in
 * the form and the cache layer falls back to when a record does not say.
 */
export const CACHE_EXPIRATION_DEFAULT_MINUTES = 30;

export interface TransferOptions {
	overwrite: boolean;
	merge: boolean;
}

/** One uploaded part of a split upload, as the provider identified it back. */
export interface MultipartPart {
	/** 1-based, because that is what S3's `PartNumber` is. */
	part_number: number;
	etag: string;
}

export interface StorageAdapter {
	readonly driver: StorageDriver;
	readonly capabilities: ReadonlySet<StorageCapability>;
	list(path: string, options: ListOptions): Promise<{ content: FileObject[]; total: number }>;
	get(path: string): Promise<FileObject>;
	read(path: string, range?: string): Promise<Response>;
	write(path: string, request: Request): Promise<void>;
	mkdir(path: string): Promise<void>;
	remove(path: string): Promise<void>;
	rename(path: string, name: string, overwrite: boolean): Promise<void>;
	copy(source: string, destination: string, options: TransferOptions): Promise<void>;
	move(source: string, destination: string, options: TransferOptions): Promise<void>;
	/**
	 * Split uploads. Optional because only some drivers can reassemble parts;
	 * the caller must check `capabilities` for `multipart` before calling any of
	 * these, and every implementation keeps the provider's own upload id opaque.
	 */
	multipartInit?(path: string): Promise<string>;
	/** Uploads one part and returns the provider's identifier for it. */
	multipartUploadPart?(path: string, uploadId: string, partNumber: number, body: ArrayBuffer): Promise<string>;
	multipartComplete?(path: string, uploadId: string, parts: MultipartPart[]): Promise<void>;
	multipartAbort?(path: string, uploadId: string): Promise<void>;
}

export function normalizePath(path: string): string {
	const normalized = `/${path}`.replaceAll(/\\+/g, "/").replaceAll(/\/+/g, "/");
	const parts: string[] = [];
	for (const part of normalized.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return `/${parts.join("/")}`;
}

export function joinPath(parent: string, child: string): string {
	return normalizePath(`${parent}/${child}`);
}

/**
 * The directory holding `path`. The root is its own parent, so walking up
 * terminates there instead of escaping to an empty path.
 */
export function parentOf(path: string): string {
	const normalized = normalizePath(path);
	if (normalized === "/") return "/";
	const segments = normalized.split("/").filter(Boolean);
	segments.pop();
	return normalizePath(`/${segments.join("/")}`);
}

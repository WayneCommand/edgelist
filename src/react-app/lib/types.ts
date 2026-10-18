/**
 * The wire types, mirroring the Worker's responses.
 *
 * These are a transcription of what `src/worker` returns, not a design. Where the
 * Worker publishes a field the interface does not draw, it is still declared:
 * `ObjMask` bits and `provider` are how the UI decides which actions to offer,
 * and `readme`/`header` are the directory's own markdown.
 */

/** OpenList's `ObjMask` (`src/worker/storage/types.ts`, from `internal/model/obj.go`). */
export const ObjMask = {
	Virtual: 1 << 0,
	NoRename: 1 << 1,
	NoRemove: 1 << 2,
	NoMove: 1 << 3,
	NoCopy: 1 << 4,
	NoWrite: 1 << 5,
	Temp: 1 << 6,
} as const;

/** A mount point: writable through, but not renameable, movable or removable. */
export const OBJ_LOCKED = ObjMask.NoRename | ObjMask.NoRemove | ObjMask.NoMove;

/** An intermediate level that only exists to reach a nested mount. */
export const OBJ_READ_ONLY = OBJ_LOCKED | ObjMask.NoWrite;

export type FileObject = {
	name: string;
	size: number;
	is_dir: boolean;
	modified: string;
	created?: string;
	/** Virtual path, always absolute. */
	path: string;
	/** `ObjMask` bits; `0`/absent means every action is allowed. */
	mask?: number;
	/** Driver key serving the entry: `object`, `webdav` or `openlist`. */
	provider?: string;
	hashinfo?: Record<string, unknown>;
	[key: string]: unknown;
};

export type FileList = {
	content: FileObject[];
	total: number;
	/** Markdown (or a URL) from the directory's metadata rule. */
	readme?: string;
	header?: string;
};

export type SearchResult = {
	content: Array<{ parent: string; name: string; is_dir: boolean; size: number; path: string }>;
	total: number;
	/** The scan hit its depth or directory budget before finishing. */
	truncated?: boolean;
};

export type DirectoryNode = { name: string; path: string; children?: DirectoryNode[] };

export type RemoveResult = { removed: string[]; failed: Array<{ name: string; error: string }> };

export type TransferRequest = {
	src_dir: string;
	dst_dir: string;
	names: string[];
	overwrite?: boolean;
	skip_existing?: boolean;
	merge?: boolean;
};

export type TransferItemResult = {
	name: string;
	source: string;
	destination?: string;
	status: "accepted" | "skipped" | "failed";
	error?: string;
	code?: string;
};

export type TransferResult = {
	operation: "copy" | "move";
	results: TransferItemResult[];
	accepted: number;
	skipped: number;
	failed: number;
};

export type MultipartStatus = {
	upload_id: string;
	path: string;
	size: number;
	chunk_size: number;
	uploaded: number[];
};

export type LoginResult = { token: string };

export type MeResult = { username: string; is_admin: boolean; disabled: boolean };

/* -------------------------------------------------------------------- admin */

export type StorageDriver = "openlist" | "object" | "webdav";

export type StorageConfig = {
	id: number;
	mount_path: string;
	order: number;
	driver: StorageDriver;
	status: string;
	/** The driver's own fields, as a JSON string — OpenList's wire shape. */
	addition: string;
	remark: string;
	disabled: boolean;
	modified?: string;
	extract_folder?: string;
	cache_expiration?: number;
	custom_cache_policies?: string;
	order_by?: string;
	order_direction?: string;
	[key: string]: unknown;
};

export type StorageList = { content: StorageConfig[]; total: number };

export type DriverItemType = "string" | "number" | "bool" | "select" | "text";

export type DriverItem = {
	name: string;
	type: DriverItemType;
	default: string;
	/** Comma separated, when `type` is `select`. */
	options?: string;
	required?: boolean;
	help?: string;
	/** Render as a password field. */
	secret?: boolean;
};

export type DriverInfo = {
	/** Matches `StorageConfig.driver`; the display name does not. */
	key: string;
	name: string;
	/** Items that live on the storage record itself. */
	common: DriverItem[];
	/** Items that live inside `addition`. */
	additional: DriverItem[];
	/** e.g. `multipart`. Absent against an older Worker, so optional. */
	capabilities?: string[];
};

export type MetaRule = {
	id: number;
	path: string;
	read_users?: number[];
	read_users_sub?: boolean;
	write_users?: number[];
	write_users_sub?: boolean;
	password?: string;
	p_sub?: boolean;
	write?: boolean;
	w_sub?: boolean;
	hide?: string;
	h_sub?: boolean;
	readme?: string;
	r_sub?: boolean;
	header?: string;
	header_sub?: boolean;
	[key: string]: unknown;
};

/**
 * An OpenList backup file.
 *
 * `storages`/`metas`/`settings` are either raw records or, when a password was
 * given, per-field AES ciphertext — the restore endpoint decides which by reading
 * the `encrypted` marker, so the client only has to pass the document through.
 */
export type BackupData = {
	encrypted: string;
	settings: unknown[];
	users: unknown[];
	storages: unknown[];
	metas: unknown[];
	shares: unknown[];
};

export type RestoreResult = { storages: number; metas: number };

export type LoginResponse = { code: number; message: string; data?: { token: string } };

export type FileItem = {
	name: string;
	size: number;
	is_dir: boolean;
	modified: string;
	created?: string;
	path: string;
	/** OpenList `ObjMask` bits; 0 or undefined means every action is allowed. */
	mask?: number;
	/** Driver that serves this entry: `object`, `webdav` or `openlist`. */
	provider?: string;
};

export type FileListResponse = { content: FileItem[]; total: number };

export type Storage = {
	id: number;
	mount_path: string;
	driver: "openlist" | "object" | "webdav";
	addition: string;
	remark: string;
	disabled?: boolean;
	order?: number;
	status?: string;
	order_by?: string;
	order_direction?: string;
	extract_folder?: string;
	[key: string]: unknown;
};

export type StorageListResponse = { content: Storage[] };

export type Meta = { id: number; path: string; password?: string; write?: boolean; hide?: string; readme?: string };

export type SortField = "name" | "size" | "modified";
export type SortDirection = "asc" | "desc";

export type SortState = { field: SortField; direction: SortDirection };

export type TransferMode = "copy" | "move";

export type TransferItemResult = {
	name: string;
	source: string;
	destination?: string;
	/** Per-entry outcome: a batch can partly succeed. */
	status: "accepted" | "skipped" | "failed";
	error?: string;
	/** Machine-readable reason, e.g. `CROSS_STORAGE_TRANSFER`. */
	code?: string;
};

export type TransferResult = {
	operation: TransferMode;
	results: TransferItemResult[];
	accepted: number;
	skipped: number;
	failed: number;
};

export type DirectoryNode = { name: string; path: string; children?: DirectoryNode[] };

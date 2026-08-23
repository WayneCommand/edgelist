export type StorageDriver = "openlist" | "object" | "webdav";

export interface StorageConfig {
	id: number;
	mount_path: string;
	order: number;
	driver: StorageDriver;
	status: string;
	addition: string;
	remark: string;
	disabled: boolean;
	disable_index: boolean;
	enable_sign: boolean;
	[key: string]: unknown;
}

export interface FileObject {
	name: string;
	size: number;
	is_dir: boolean;
	modified: string;
	created: string;
	path: string;
	hashinfo?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ListOptions {
	page: number;
	per_page: number;
	refresh: boolean;
}

export interface StorageAdapter {
	readonly driver: StorageDriver;
	list(path: string, options: ListOptions): Promise<{ content: FileObject[]; total: number }>;
	get(path: string): Promise<FileObject>;
	read(path: string, range?: string): Promise<Response>;
	write(path: string, request: Request): Promise<void>;
	mkdir(path: string): Promise<void>;
	remove(path: string): Promise<void>;
	rename(path: string, name: string, overwrite: boolean): Promise<void>;
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

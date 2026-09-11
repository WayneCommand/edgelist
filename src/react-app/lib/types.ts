export type LoginResponse = { code: number; message: string; data?: { token: string } };
export type FileItem = { name: string; size: number; is_dir: boolean; modified: string; path: string };
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
export type Meta = { id: number; path: string; password?: string; write?: boolean; hide?: string; readme?: string };

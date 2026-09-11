import { readConfig } from "./env";
import { normalizePath } from "./storage/types";

export interface MetaConfig {
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
}

function metaCoversPath(metaPath: string, reqPath: string, applyToSubFolder: boolean): boolean {
	const normalizedMeta = normalizePath(metaPath);
	const normalizedReq = normalizePath(reqPath);
	if (normalizedMeta === normalizedReq) return true;
	return applyToSubFolder && normalizedReq.startsWith(`${normalizedMeta}/`);
}

function pathDir(path: string): string {
	const normalized = normalizePath(path);
	if (normalized === "/") return "/";
	const parts = normalized.split("/").filter(Boolean);
	parts.pop();
	return `/${parts.join("/")}`;
}

export async function getNearestMeta(kv: KVNamespace, path: string): Promise<MetaConfig | null> {
	const normalized = normalizePath(path);
	const metas = (await readConfig(kv, "metas")) as MetaConfig[];
	if (!Array.isArray(metas)) return null;
	const exact = metas.find((meta) => normalizePath(meta.path) === normalized);
	if (exact) return exact;
	if (normalized === "/") return null;
	return getNearestMeta(kv, pathDir(normalized));
}

export function canRead(user: { id?: number } | null, meta: MetaConfig | null, path: string): boolean {
	if (!user || !meta) return true;
	if (
		meta.read_users &&
		meta.read_users.length > 0 &&
		user.id !== undefined &&
		!meta.read_users.includes(user.id) &&
		metaCoversPath(meta.path, path, meta.read_users_sub ?? false)
	) {
		return false;
	}
	return true;
}

export function canWrite(
	user: { id?: number; permission?: number } | null,
	meta: MetaConfig | null,
	path: string,
): boolean {
	if (!user || !meta) return true;
	if (meta.write === false && metaCoversPath(meta.path, path, meta.w_sub ?? false)) {
		return false;
	}
	if (
		meta.write_users &&
		meta.write_users.length > 0 &&
		user.id !== undefined &&
		!meta.write_users.includes(user.id) &&
		metaCoversPath(meta.path, path, meta.write_users_sub ?? false)
	) {
		return false;
	}
	return true;
}

export function canAccess(
	user: { id?: number; permission?: number } | null,
	meta: MetaConfig | null,
	reqPath: string,
	password?: string,
): boolean {
	if (!user || !meta) return true;
	if (meta.hide && meta.h_sub && metaCoversPath(meta.path, pathDir(reqPath), true)) {
		const patterns = meta.hide.split("\n").filter(Boolean);
		const fileName = reqPath.split("/").pop() ?? "";
		for (const pattern of patterns) {
			try {
				if (new RegExp(pattern).test(fileName)) return false;
			} catch {
				/* invalid regex pattern, skip */
			}
		}
	}
	if (!canRead(user, meta, reqPath)) return false;
	if (user.permission !== undefined && (user.permission & 2) !== 0) return true;
	if (!meta.password) return true;
	if (!metaCoversPath(meta.path, reqPath, meta.p_sub ?? false)) return true;
	return meta.password === password;
}

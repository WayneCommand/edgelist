import type { EdgeListBindings } from "../env";
import { listStorageConfigs } from "./config";
import { OpenListAdapter } from "./openlist";
import { S3Adapter } from "./s3";
import { WebdavAdapter } from "./webdav";
import { normalizePath, type StorageAdapter, type StorageConfig } from "./types";

export function relativeStoragePath(mountPath: string, path: string): string {
	const mount = normalizePath(mountPath);
	const normalized = normalizePath(path);
	if (mount === "/") return normalized;
	if (normalized !== mount && !normalized.startsWith(`${mount}/`)) throw new Error("Path is outside storage mount");
	return normalizePath(normalized.slice(mount.length) || "/");
}

export async function resolveStorage(env: Env & EdgeListBindings, path: string): Promise<{ config: StorageConfig; path: string; adapter: StorageAdapter }> {
	const normalized = normalizePath(path);
	const configs = await listStorageConfigs(env.EDGE_CONFIG);
	const config = configs
		.filter((item) => {
			const mount = normalizePath(item.mount_path);
			return normalized === mount || normalized.startsWith(`${mount}/`) || mount === "/";
		})
		.sort((a, b) => normalizePath(b.mount_path).length - normalizePath(a.mount_path).length)[0];
	if (!config || config.disabled) throw new Error("Storage not found");
	return { config, path: relativeStoragePath(config.mount_path, normalized), adapter: createAdapter(env, config) };
}

export function createAdapter(_env: Env & EdgeListBindings, config: StorageConfig): StorageAdapter {
	switch (config.driver) {
		case "openlist": return new OpenListAdapter(config);
		case "object": return new S3Adapter(config);
		case "webdav": return new WebdavAdapter(config);
	}
}

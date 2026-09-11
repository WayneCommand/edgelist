import type { EdgeListBindings } from "../env";
import { listStorageConfigs, selectStorage } from "./config";
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

export async function resolveStorage(
	env: Env & EdgeListBindings,
	path: string,
): Promise<{ config: StorageConfig; path: string; adapter: StorageAdapter }> {
	const normalized = normalizePath(path);
	const config = selectStorage(await listStorageConfigs(env.EDGE_CONFIG), normalized);
	if (!config) throw new Error("Storage not found");
	return { config, path: relativeStoragePath(config.mount_path, normalized), adapter: createAdapter(env, config) };
}

export function createAdapter(_env: Env & EdgeListBindings, config: StorageConfig): StorageAdapter {
	switch (config.driver) {
		case "openlist":
			return new OpenListAdapter(config);
		case "object":
			return new S3Adapter(config);
		case "webdav":
			return new WebdavAdapter(config);
	}
}

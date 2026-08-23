import { CONFIG_KEYS, readConfig, type EdgeListBindings } from "../env";
import type { FileObject, StorageConfig, StorageDriver } from "./types";
import { normalizePath } from "./types";

export async function listStorageConfigs(kv: KVNamespace): Promise<StorageConfig[]> {
	const value = await readConfig(kv, CONFIG_KEYS.storages);
	return Array.isArray(value) ? value.filter(isStorageConfig) : [];
}

export async function getStorageConfig(kv: KVNamespace, mountPath: string): Promise<StorageConfig | null> {
	const storages = await listStorageConfigs(kv);
	const normalized = normalizePath(mountPath);
	return storages.find((storage) => normalizePath(storage.mount_path) === normalized) ?? null;
}

export async function listVirtualMounts(kv: KVNamespace, parentPath: string): Promise<FileObject[]> {
	const parent = normalizePath(parentPath);
	const prefix = parent === "/" ? "/" : `${parent}/`;
	const mounts = await listStorageConfigs(kv);
	const children = new Map<string, FileObject>();
	for (const storage of mounts) {
		const mount = normalizePath(storage.mount_path);
		if (mount === parent || !mount.startsWith(prefix)) continue;
		const relative = mount.slice(prefix.length);
		const name = relative.split("/")[0];
		if (!name || children.has(name)) continue;
		children.set(name, {
			name,
			size: 0,
			is_dir: true,
			modified: new Date(0).toISOString(),
			created: new Date(0).toISOString(),
			path: normalizePath(`${parent}/${name}`),
		});
	}
	return [...children.values()];
}

export async function isVirtualMount(kv: KVNamespace, path: string): Promise<boolean> {
	const normalized = normalizePath(path);
	if (await getStorageConfig(kv, normalized)) return false;
	return (await listVirtualMounts(kv, normalized)).length > 0;
}

export function isStorageConfig(value: unknown): value is StorageConfig {
	if (!value || typeof value !== "object") return false;
	const storage = value as Partial<StorageConfig>;
	return typeof storage.mount_path === "string" && isStorageDriver(storage.driver);
}

export function isStorageDriver(value: unknown): value is StorageDriver {
	return value === "openlist" || value === "object" || value === "webdav";
}

export function storageBindings(env: Env & EdgeListBindings) {
	return env.EDGE_CONFIG;
}

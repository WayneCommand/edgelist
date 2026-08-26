import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { CONFIG_KEYS, readConfig } from "./env";
import { failure, respond } from "./response";
import type { MetaConfig } from "./meta";
import { normalizePath, type StorageConfig } from "./storage";

type AdminContext = Context<{ Bindings: Env & EdgeListBindings }>;

async function readArray<T>(kv: KVNamespace, key: string): Promise<T[]> {
	const value = await readConfig(kv, key);
	return Array.isArray(value) ? value as T[] : [];
}

async function saveArray(kv: KVNamespace, key: string, value: unknown[]) {
	await kv.put(key, JSON.stringify(value));
}

export function removeByIdentity<T extends Record<string, unknown>>(items: T[], key: string, value: unknown): T[] {
	return items.filter((item) => item[key] !== value);
}

export async function storageList(c: AdminContext) {
	const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
	return respond(c, { content: storages, total: storages.length });
}

export async function storageSave(c: AdminContext) {
	try {
		const input = await c.req.json<StorageConfig>();
		if (!input.mount_path || !input.driver) return failure("mount_path and driver are required", 400);
		const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
		const mountPath = normalizePath(input.mount_path);
		const duplicate = storages.some((item) => item.id !== input.id && normalizePath(item.mount_path) === mountPath);
		if (duplicate) return failure("mount_path must be unique", 409);
		const index = storages.findIndex((item) => item.id === input.id || normalizePath(item.mount_path) === mountPath);
		const item = { ...input, mount_path: mountPath, id: input.id || Math.max(0, ...storages.map((storage) => storage.id || 0)) + 1 };
		if (index === -1) storages.push(item); else storages[index] = item;
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.storages, storages);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Invalid storage", 400); }
}

export async function storageDelete(c: AdminContext) {
	try {
		const input = await c.req.json<{ id?: number; mount_path?: string }>();
		if (!(typeof input.id === "number" && input.id > 0) && !input.mount_path) return failure("id or mount_path is required", 400);
		const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
		const filtered = typeof input.id === "number" && input.id > 0
			? removeByIdentity(storages, "id", input.id)
			: removeByIdentity(storages, "mount_path", input.mount_path);
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.storages, filtered);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Invalid storage", 400); }
}

export async function metaList(c: AdminContext) {
	const metas = await readArray<MetaConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.metas);
	return respond(c, { content: metas, total: metas.length });
}

export async function metaSave(c: AdminContext) {
	try {
		const input = await c.req.json<MetaConfig>();
		if (!input.path) return failure("path is required", 400);
		const metas = await readArray<MetaConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.metas);
		const index = metas.findIndex((item) => item.id === input.id || item.path === input.path);
		const item = { ...input, id: input.id || Math.max(0, ...metas.map((meta) => meta.id || 0)) + 1 };
		if (index === -1) metas.push(item); else metas[index] = item;
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.metas, metas);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Invalid metadata", 400); }
}

export async function metaDelete(c: AdminContext) {
	try {
		const input = await c.req.json<{ id?: number; path?: string }>();
		if (!(typeof input.id === "number" && input.id > 0) && !input.path) return failure("id or path is required", 400);
		const metas = await readArray<MetaConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.metas);
		const filtered = typeof input.id === "number" && input.id > 0
			? removeByIdentity(metas, "id", input.id)
			: removeByIdentity(metas, "path", input.path);
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.metas, filtered);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Invalid metadata", 400); }
}

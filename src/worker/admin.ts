import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { CONFIG_KEYS, readConfig } from "./env";
import { failure, respond } from "./response";
import type { MetaConfig } from "./meta";
import type { StorageConfig } from "./storage";

type AdminContext = Context<{ Bindings: Env & EdgeListBindings }>;

async function readArray<T>(kv: KVNamespace, key: string): Promise<T[]> {
	const value = await readConfig(kv, key);
	return Array.isArray(value) ? value as T[] : [];
}

async function saveArray(kv: KVNamespace, key: string, value: unknown[]) {
	await kv.put(key, JSON.stringify(value));
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
		const index = storages.findIndex((item) => item.id === input.id || item.mount_path === input.mount_path);
		const item = { ...input, id: input.id || Math.max(0, ...storages.map((storage) => storage.id || 0)) + 1 };
		if (index === -1) storages.push(item); else storages[index] = item;
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.storages, storages);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Invalid storage", 400); }
}

export async function storageDelete(c: AdminContext) {
	try {
		const input = await c.req.json<{ id?: number; mount_path?: string }>();
		const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.storages, storages.filter((item) => item.id !== input.id && item.mount_path !== input.mount_path));
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
		const metas = await readArray<MetaConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.metas);
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.metas, metas.filter((item) => item.id !== input.id && item.path !== input.path));
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Invalid metadata", 400); }
}

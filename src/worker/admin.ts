import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { CONFIG_KEYS, readConfig } from "./env";
import { failure, respond } from "./response";
import type { MetaConfig } from "./meta";
import { DRIVERS, findDriver, getDriverInfo } from "./storage/registry";
import {
	hasValidStorageAddition,
	isStorageDriver,
	listStorageConfigs,
	normalizePath,
	normalizeStorageConfig,
	type StorageConfig,
} from "./storage";

type AdminContext = Context<{ Bindings: Env & EdgeListBindings }>;

async function readArray<T>(kv: KVNamespace, key: string): Promise<T[]> {
	const value = await readConfig(kv, key);
	return Array.isArray(value) ? (value as T[]) : [];
}

async function saveArray(kv: KVNamespace, key: string, value: unknown[]) {
	await kv.put(key, JSON.stringify(value));
}

export function removeByIdentity<T extends Record<string, unknown>>(items: T[], key: string, value: unknown): T[] {
	return items.filter((item) => item[key] !== value);
}

export async function storageList(c: AdminContext) {
	const storages = await listStorageConfigs(c.env.EDGE_CONFIG);
	const page = Math.max(1, Number(c.req.query("page")) || 1);
	const perPage = Math.max(0, Number(c.req.query("per_page")) || 0);
	if (perPage <= 0) return respond(c, { content: storages, total: storages.length });
	const start = (page - 1) * perPage;
	return respond(c, { content: storages.slice(start, start + perPage), total: storages.length });
}

export async function storageGet(c: AdminContext) {
	const id = Number(c.req.query("id"));
	if (!Number.isInteger(id) || id <= 0) return failure("A positive storage id is required", 400);
	const storage = (await listStorageConfigs(c.env.EDGE_CONFIG)).find((item) => item.id === id);
	if (!storage) return failure("Storage not found", 404);
	return respond(c, storage);
}

export async function storageSave(c: AdminContext) {
	try {
		const input = await c.req.json<StorageConfig>();
		if (!input.mount_path || !input.driver) return failure("mount_path and driver are required", 400);
		if (!isStorageDriver(input.driver)) return failure("Unsupported storage driver", 400);
		const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
		const mountPath = normalizePath(input.mount_path);
		const duplicate = storages.some((item) => item.id !== input.id && normalizePath(item.mount_path) === mountPath);
		if (duplicate) return failure("mount_path must be unique", 409);
		const index = storages.findIndex((item) => item.id === input.id || normalizePath(item.mount_path) === mountPath);
		const normalized = normalizeStorageConfig({ ...input, mount_path: mountPath });
		if (!hasValidStorageAddition(normalized)) return failure("The storage addition is missing required fields", 400);
		const item = {
			...normalized,
			id: input.id || Math.max(0, ...storages.map((storage) => storage.id || 0)) + 1,
			modified: new Date().toISOString(),
			status: normalized.disabled ? "disabled" : normalized.status || "work",
		};
		if (index === -1) storages.push(item);
		else storages[index] = item;
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.storages, storages);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Invalid storage", 400);
	}
}

export async function storageCreate(c: AdminContext) {
	return storageSave(c);
}

export async function storageUpdate(c: AdminContext) {
	try {
		const input = await c.req.json<StorageConfig>();
		if (!input.id || input.id <= 0) return failure("id is required for update", 400);
		const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
		if (!storages.some((item) => item.id === input.id)) return failure("Storage not found", 404);
		return storageSave(c);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Invalid storage", 400);
	}
}

async function changeStorageDisabled(c: AdminContext, disabled: boolean) {
	const id = Number(c.req.query("id"));
	if (!Number.isInteger(id) || id <= 0) return failure("A positive storage id is required", 400);
	const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
	const storage = storages.find((item) => item.id === id);
	if (!storage) return failure("Storage not found", 404);
	const updated = {
		...storage,
		disabled,
		modified: new Date().toISOString(),
		status: disabled ? "disabled" : "work",
	};
	await saveArray(
		c.env.EDGE_CONFIG,
		CONFIG_KEYS.storages,
		storages.map((item) => (item.id === id ? updated : item)),
	);
	return respond(c, null);
}

export async function storageEnable(c: AdminContext) {
	return changeStorageDisabled(c, false);
}

export async function storageDisable(c: AdminContext) {
	return changeStorageDisabled(c, true);
}

export async function storageLoadAll(c: AdminContext) {
	await listStorageConfigs(c.env.EDGE_CONFIG);
	return respond(c, null);
}

export async function storageDelete(c: AdminContext) {
	try {
		const input = await c.req.json<{ id?: number; mount_path?: string }>();
		if (!(typeof input.id === "number" && input.id > 0) && !input.mount_path)
			return failure("id or mount_path is required", 400);
		const storages = await readArray<StorageConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.storages);
		const filtered =
			typeof input.id === "number" && input.id > 0
				? removeByIdentity(storages, "id", input.id)
				: removeByIdentity(storages, "mount_path", input.mount_path);
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.storages, filtered);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Invalid storage", 400);
	}
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
		if (index === -1) metas.push(item);
		else metas[index] = item;
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.metas, metas);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Invalid metadata", 400);
	}
}

export async function metaDelete(c: AdminContext) {
	try {
		const input = await c.req.json<{ id?: number; path?: string }>();
		if (!(typeof input.id === "number" && input.id > 0) && !input.path) return failure("id or path is required", 400);
		const metas = await readArray<MetaConfig>(c.env.EDGE_CONFIG, CONFIG_KEYS.metas);
		const filtered =
			typeof input.id === "number" && input.id > 0
				? removeByIdentity(metas, "id", input.id)
				: removeByIdentity(metas, "path", input.path);
		await saveArray(c.env.EDGE_CONFIG, CONFIG_KEYS.metas, filtered);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Invalid metadata", 400);
	}
}

export function driverNames(c: AdminContext) {
	return respond(
		c,
		DRIVERS.map((d) => d.name),
	);
}

export function driverList(c: AdminContext) {
	return respond(c, DRIVERS.map(getDriverInfo));
}

export function driverInfo(c: AdminContext) {
	const driverName = c.req.query("driver");
	if (!driverName) return failure("driver query parameter is required", 400);
	const driver = findDriver(driverName);
	if (!driver) return failure("Driver not found", 404);
	return respond(c, getDriverInfo(driver));
}

import CryptoJS from "crypto-js";
import type { Context } from "hono";
import { CONFIG_KEYS, readConfig, type EdgeListBindings } from "./env";
import { failure } from "./response";
import { listStorageConfigs } from "./storage";
import type { MetaConfig } from "./meta";
import type { StorageConfig } from "./storage";

interface BackupData {
	encrypted: string;
	settings: unknown[];
	users: unknown[];
	storages: unknown[];
	metas: unknown[];
	shares: unknown[];
}

type BackupContext = Context<{ Bindings: Env & EdgeListBindings }>;

function encrypt(value: unknown, password: string): string {
	if (!password) return value as string;
	const cipher = CryptoJS.AES.encrypt(JSON.stringify(value), password).toString();
	return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(cipher));
}

function encryptRecord(value: unknown, password: string): unknown {
	if (!password || !value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encrypt(item, password)]));
}

function decrypt(value: unknown, password: string, encrypted: boolean): unknown {
	if (!encrypted) return value;
	if (typeof value !== "string") throw new Error("Invalid encrypted backup value");
	const cipher = CryptoJS.enc.Base64.parse(value).toString(CryptoJS.enc.Utf8);
	const plain = CryptoJS.AES.decrypt(cipher, password).toString(CryptoJS.enc.Utf8);
	if (!plain) throw new Error("Invalid backup password");
	return JSON.parse(plain);
}

function decryptRecord(value: unknown, password: string, encrypted: boolean): Record<string, unknown> {
	if (!value || typeof value !== "object") throw new Error("Invalid backup record");
	if (!encrypted) return value as Record<string, unknown>;
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decrypt(item, password, true)]));
}

export async function backupExport(c: BackupContext) {
	try {
		const input = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
		const password = input.password ?? "";
		const settings = await readConfig(c.env.EDGE_CONFIG, CONFIG_KEYS.settings);
		const metas = (await readConfig(c.env.EDGE_CONFIG, CONFIG_KEYS.metas) ?? []) as MetaConfig[];
		const storages = await listStorageConfigs(c.env.EDGE_CONFIG);
		const backup: BackupData = {
			encrypted: encrypt("encrypted", password),
			settings: Array.isArray(settings) ? settings : [],
			users: [],
			storages: storages.map((item) => encryptRecord(item, password)),
			metas: Array.isArray(metas) ? metas.map((item) => encryptRecord(item, password)) : [],
			shares: [],
		};
		if (password) {
			backup.settings = backup.settings.map((item) => encryptRecord(item, password));
		}
		return new Response(JSON.stringify(backup, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="openlist_backup.json"` } });
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to create backup", 500); }
}

export async function backupRestore(c: BackupContext) {
	try {
		const input = await c.req.json<{ password?: string; override?: boolean; data?: BackupData }>();
		const data = input.data ?? input as unknown as BackupData;
		if (!data || !Array.isArray(data.storages) || !Array.isArray(data.metas)) return failure("Invalid backup format", 400);
		const password = input.password ?? "";
		const encrypted = Boolean(data.encrypted);
		if (encrypted && decrypt(data.encrypted, password, true) !== "encrypted") return failure("Invalid backup password", 401);
		const storages = data.storages.map((item) => decryptRecord(item, password, encrypted) as StorageConfig);
		const metas = data.metas.map((item) => decryptRecord(item, password, encrypted) as MetaConfig);
		const currentStorages = await listStorageConfigs(c.env.EDGE_CONFIG);
		const currentMetas = (await readConfig(c.env.EDGE_CONFIG, CONFIG_KEYS.metas) ?? []) as MetaConfig[];
		const restoredStorages = assignIds(input.override ? mergeBy<StorageConfig>(currentStorages, storages, "mount_path") : storages.map((item) => ({ ...item, id: 0 })));
		const restoredMetas = assignIds(input.override ? mergeBy<MetaConfig>(currentMetas, metas, "path") : metas.map((item) => ({ ...item, id: 0 })));
		await c.env.EDGE_CONFIG.put(CONFIG_KEYS.storages, JSON.stringify(restoredStorages));
		await c.env.EDGE_CONFIG.put(CONFIG_KEYS.metas, JSON.stringify(restoredMetas));
		if (Array.isArray(data.settings)) {
			const settings = data.settings.map((item) => decryptRecord(item, password, encrypted)).filter((item) => item.key !== "version" && item.key !== "index_progress");
			await c.env.EDGE_CONFIG.put(CONFIG_KEYS.settings, JSON.stringify(settings));
		}
		return Response.json({ code: 200, message: "success", data: { storages: restoredStorages.length, metas: restoredMetas.length } });
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to restore backup", 400); }
}

function mergeBy<T extends Record<string, unknown>>(current: T[], incoming: T[], key: string): T[] {
	const result = [...current];
	for (const item of incoming) {
		const index = result.findIndex((existing) => existing[key] === item[key]);
		if (index === -1) result.push(item); else result[index] = { ...result[index], ...item };
	}
	return result;
}

function assignIds<T extends { id: number }>(items: T[]): T[] {
	let nextId = Math.max(0, ...items.map((item) => Number.isFinite(item.id) && item.id > 0 ? item.id : 0)) + 1;
	const used = new Set<number>();
	return items.map((item) => {
		if (item.id > 0 && !used.has(item.id)) { used.add(item.id); return item; }
		while (used.has(nextId)) nextId += 1;
		const result = { ...item, id: nextId };
		used.add(nextId); nextId += 1;
		return result;
	});
}

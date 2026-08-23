import CryptoJS from "crypto-js";
import type { Context } from "hono";
import { CONFIG_KEYS, readConfig, type EdgeListBindings } from "./env";
import { failure } from "./response";
import { listStorageConfigs } from "./storage";
import type { MetaConfig } from "./meta";

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

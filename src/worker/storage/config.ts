import { CONFIG_KEYS, readConfig, type EdgeListBindings } from "../env";
import type { FileObject, StorageConfig, StorageDriver } from "./types";
import { normalizePath } from "./types";

export async function listStorageConfigs(kv: KVNamespace): Promise<StorageConfig[]> {
	const value = await readConfig(kv, CONFIG_KEYS.storages);
	return Array.isArray(value) ? value.filter(isStorageConfig).map(normalizeStorageConfig) : [];
}

export async function getStorageConfig(kv: KVNamespace, mountPath: string): Promise<StorageConfig | null> {
	const storages = await listStorageConfigs(kv);
	const normalized = normalizePath(mountPath);
	return storages.find((storage) => normalizePath(storage.mount_path) === normalized) ?? null;
}

export async function listVirtualMounts(kv: KVNamespace, parentPath: string): Promise<FileObject[]> {
	const parent = normalizePath(parentPath);
	const prefix = parent === "/" ? "/" : `${parent}/`;
	const mounts = (await listStorageConfigs(kv))
		.filter((storage) => !storage.disabled)
		.sort((left, right) => left.order - right.order || normalizePath(left.mount_path).localeCompare(normalizePath(right.mount_path)));
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

export function mergeFileObjects(items: FileObject[], virtualMounts: FileObject[]): FileObject[] {
	const seen = new Set(items.map((item) => item.name));
	return [...items, ...virtualMounts.filter((mount) => !seen.has(mount.name))];
}

export function paginateFileObjects(items: FileObject[], page: number, perPage: number): { content: FileObject[]; total: number } {
	if (perPage <= 0) return { content: items, total: items.length };
	const start = Math.max(0, (Math.max(1, page) - 1) * perPage);
	return { content: items.slice(start, start + perPage), total: items.length };
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
	return value === "openlist" || value === "OpenList" || value === "object" || value === "s3" || value === "S3" || value === "Doge" || value === "webdav" || value === "WebDav" || value === "WebDAV";
}

// Storage fields that OpenList spells differently from early EdgeList builds.
// Each rule first rewrites legacy spellings, then clamps the outcome to the
// values OpenList actually understands, so downstream code can trust what it
// reads and a backup round trip never carries a value nobody can interpret.
// An absent field stays absent; only values that are present get normalised.
type SelectRule = { aliases?: Record<string, string>; allowed: readonly string[]; fallback: string };

// Early EdgeList builds used `folder_order` with `before`/`after`.
const EXTRACT_FOLDER: SelectRule = { aliases: { before: "front", after: "back" }, allowed: ["", "front", "back"], fallback: "front" };

// `""` is OpenList's "leave the upstream order alone". `created` was an
// EdgeList-only option that OpenList cannot express, so it folds to the default.
const ORDER_BY: SelectRule = { allowed: ["", "name", "size", "modified"], fallback: "name" };

// Early EdgeList builds stored the shorter `302` / `proxy` spellings.
const WEBDAV_POLICY: SelectRule = {
	aliases: { "302": "302_redirect", proxy: "native_proxy" },
	allowed: ["", "302_redirect", "use_proxy_url", "native_proxy"],
	fallback: "native_proxy",
};

function selectValue(candidate: unknown, rule: SelectRule): string | undefined {
	if (typeof candidate !== "string") return undefined;
	const mapped = rule.aliases?.[candidate] ?? candidate;
	return rule.allowed.includes(mapped) ? mapped : rule.fallback;
}

export function normalizeStorageConfig(value: StorageConfig): StorageConfig {
	const rawDriver = String(value.driver);
	const normalizedDriver = rawDriver.toLowerCase();
	const driver: StorageDriver = normalizedDriver === "s3" || normalizedDriver === "doge" || normalizedDriver === "object"
		? "object"
		: normalizedDriver === "webdav"
			? "webdav"
			: "openlist";
	let addition = value.addition || "{}";
	try {
		const config = JSON.parse(addition) as Record<string, unknown>;
		if (driver === "openlist" && !config.base_url && typeof config.url === "string") config.base_url = config.url;
		if (driver === "webdav" && !config.url && typeof config.address === "string") config.url = config.address;
		addition = JSON.stringify(config);
	} catch {
		// The adapter will return a useful configuration error for malformed JSON.
	}
	const result: StorageConfig = { ...value, driver, addition };
	delete result.folder_order;
	const extractFolder = selectValue(result.extract_folder ?? value.folder_order, EXTRACT_FOLDER);
	if (extractFolder !== undefined) result.extract_folder = extractFolder;
	const orderBy = selectValue(result.order_by, ORDER_BY);
	if (orderBy !== undefined) result.order_by = orderBy;
	const webdavPolicy = selectValue(result.webdav_policy, WEBDAV_POLICY);
	if (webdavPolicy !== undefined) result.webdav_policy = webdavPolicy;
	return result;
}

export function hasValidStorageAddition(config: Pick<StorageConfig, "driver" | "addition">): boolean {
	let addition: Record<string, unknown>;
	try {
		const value = JSON.parse(config.addition || "{}");
		if (!value || typeof value !== "object" || Array.isArray(value)) return false;
		addition = value as Record<string, unknown>;
	} catch {
		return false;
	}
	const required = (names: string[]) => names.every((name) => typeof addition[name] === "string" && addition[name].length > 0);
	if (config.driver === "openlist") return required(["base_url"]) || required(["url"]);
	if (config.driver === "object") return required(["endpoint", "bucket", "access_key_id", "secret_access_key"]);
	if (config.driver === "webdav") return required(["url"]) || required(["address"]);
	return false;
}

export function storageBindings(env: Env & EdgeListBindings) {
	return env.EDGE_CONFIG;
}

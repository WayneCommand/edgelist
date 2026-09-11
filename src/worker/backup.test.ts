import { describe, expect, it } from "vitest";
import type { StorageConfig } from "./storage/types";
import { backupExport, backupRestore } from "./backup";
import { listStorageConfigs } from "./storage";

type BackupContext = Parameters<typeof backupRestore>[0];

const STORAGES_KEY = "config:storages";

function legacyStorage(extra: Record<string, unknown> = {}): StorageConfig {
	return {
		id: 0,
		mount_path: "/legacy",
		order: 0,
		driver: "object",
		status: "work",
		addition: "{}",
		remark: "",
		disabled: false,
		...extra,
	};
}

// The KV namespace is only used through `get(key, "json")` and `put(key, text)`
// here, so a Map is enough to observe what a restore actually persisted.
function fakeKv(seed: Record<string, unknown> = {}) {
	const store = new Map<string, unknown>(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
	const kv = {
		get: (_key: string) => Promise.resolve(store.has(_key) ? structuredClone(store.get(_key)) : null),
		put: (key: string, value: string) => {
			store.set(key, JSON.parse(value));
			return Promise.resolve();
		},
		delete: (key: string) => {
			store.delete(key);
			return Promise.resolve();
		},
	};
	return { kv: kv as unknown as KVNamespace, store };
}

function context(kv: KVNamespace, body: unknown): BackupContext {
	return { req: { json: () => Promise.resolve(body) }, env: { EDGE_CONFIG: kv } } as unknown as BackupContext;
}

function backup(storages: Record<string, unknown>[], metas: unknown[] = []) {
	return { encrypted: false, settings: [], users: [], storages, metas, shares: [] };
}

async function restore(storages: Record<string, unknown>[]) {
	const { kv, store } = fakeKv();
	await backupRestore(context(kv, { data: backup(storages) }));
	return store;
}

async function exported(storages: StorageConfig[]) {
	const { kv } = fakeKv({ [STORAGES_KEY]: storages });
	const response = await backupExport(context(kv, {}));
	return (await response.json()) as { storages: Record<string, unknown>[]; metas: unknown[] };
}

describe("backup restore migration", () => {
	it("migrates legacy field names and values to the OpenList spellings", async () => {
		const store = await restore([legacyStorage({ folder_order: "before", webdav_policy: "302", order_by: "created" })]);
		const [restored] = store.get(STORAGES_KEY) as StorageConfig[];
		expect(restored.extract_folder).toBe("front");
		expect(restored.webdav_policy).toBe("302_redirect");
		expect(restored.order_by).toBe("name");
		expect(restored.folder_order).toBeUndefined();
	});

	it("migrates the after/back and proxy spellings too", async () => {
		const store = await restore([legacyStorage({ folder_order: "after", webdav_policy: "proxy" })]);
		const [restored] = store.get(STORAGES_KEY) as StorageConfig[];
		expect(restored.extract_folder).toBe("back");
		expect(restored.webdav_policy).toBe("native_proxy");
	});

	it("keeps fields OpenList defines but EdgeList does not implement", async () => {
		const store = await restore([
			legacyStorage({
				cache_expiration: 30,
				custom_cache_policies: "*.iso",
				web_proxy: true,
				down_proxy_url: "https://proxy.example",
				disable_index: true,
				enable_sign: true,
			}),
		]);
		const [restored] = store.get(STORAGES_KEY) as StorageConfig[];
		expect(restored).toMatchObject({
			cache_expiration: 30,
			custom_cache_policies: "*.iso",
			web_proxy: true,
			down_proxy_url: "https://proxy.example",
			disable_index: true,
			enable_sign: true,
		});
	});

	it("keeps native OpenList values untouched", async () => {
		const store = await restore([
			legacyStorage({
				extract_folder: "back",
				webdav_policy: "use_proxy_url",
				order_by: "size",
				order_direction: "desc",
			}),
		]);
		expect(store.get(STORAGES_KEY)).toMatchObject([
			{ extract_folder: "back", webdav_policy: "use_proxy_url", order_by: "size", order_direction: "desc" },
		]);
	});

	it("assigns ids and leaves unrelated storages in place when overriding", async () => {
		const { kv, store } = fakeKv({ [STORAGES_KEY]: [legacyStorage({ id: 1, mount_path: "/kept" })] });
		await backupRestore(context(kv, { override: true, data: backup([legacyStorage({ folder_order: "before" })]) }));
		const restored = store.get(STORAGES_KEY) as StorageConfig[];
		expect(restored).toHaveLength(2);
		expect(restored.map((item) => item.mount_path).sort()).toEqual(["/kept", "/legacy"]);
		expect(restored.every((item) => item.id > 0)).toBe(true);
	});
});

describe("backup export", () => {
	it("emits OpenList spellings and no longer leaks folder_order", async () => {
		const data = await exported([
			legacyStorage({ id: 1, extract_folder: "front", webdav_policy: "302_redirect", order_by: "name" }),
		]);
		expect(data.storages[0]).toMatchObject({
			extract_folder: "front",
			webdav_policy: "302_redirect",
			order_by: "name",
		});
		expect(data.storages[0].folder_order).toBeUndefined();
	});

	it("round trips a legacy backup into an OpenList-readable export", async () => {
		const store = await restore([
			legacyStorage({ folder_order: "before", webdav_policy: "302", order_by: "created", cache_expiration: 30 }),
		]);
		const { kv } = fakeKv({ [STORAGES_KEY]: store.get(STORAGES_KEY) as StorageConfig[] });
		const data = await exported(await listStorageConfigs(kv));
		expect(data.storages[0]).toMatchObject({
			extract_folder: "front",
			webdav_policy: "302_redirect",
			order_by: "name",
			cache_expiration: 30,
		});
	});
});

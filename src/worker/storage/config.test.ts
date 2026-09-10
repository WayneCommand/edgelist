import { describe, expect, it } from "vitest";
import { ObjMask, OBJ_LOCKED, OBJ_READ_ONLY, type StorageConfig } from "./types";
import { hasValidStorageAddition, listVirtualMounts, mergeFileObjects, mountDepth, normalizeStorageConfig, paginateFileObjects, selectStorage } from "./config";

function storage(mountPath: string, order = 0, disabled = false): StorageConfig {
	return {
		id: order + 1,
		mount_path: mountPath,
		order,
		driver: "object",
		status: "work",
		addition: "{}",
		remark: "",
		disabled,
	};
}

function kvWithStorages(storages: StorageConfig[]) {
	return {
		get: (_key: string, type: "json" | "text") => Promise.resolve(type === "json" ? storages : JSON.stringify(storages)),
	} as unknown as KVNamespace;
}

function item(name: string, path = `/${name}`) {
	return { name, size: 1, is_dir: false, modified: "", created: "", path };
}

describe("virtual mounts", () => {
	it("merges direct children of enabled mounts in storage order", async () => {
		const kv = kvWithStorages([
			storage("/mounts/second", 2),
			storage("/mounts/first", 1),
			storage("/mounts/second/nested", 3),
			storage("/disabled", 0, true),
		]);
		const mounts = await listVirtualMounts(kv, "/mounts");
		expect(mounts.map((mount) => mount.name)).toEqual(["first", "second"]);
		expect(mounts[1]).toMatchObject({ is_dir: true, path: "/mounts/second" });
	});

	it("prefers physical entries when a mount has the same name", () => {
		const physical = [item("shared", "/data/shared"), item("file.txt")];
		const virtual = [{ ...item("shared", "/data/shared"), is_dir: true }, { ...item("mount"), is_dir: true }];
		const merged = mergeFileObjects(physical, virtual);
		expect(merged.map((entry) => `${entry.name}:${entry.is_dir}`)).toEqual([
			"shared:false",
			"file.txt:false",
			"mount:true",
		]);
	});

	it("applies OpenList-style pagination where zero returns every item", () => {
		const items = [item("a"), item("b"), item("c")];
		expect(paginateFileObjects(items, 2, 2)).toEqual({ content: [items[2]], total: 3 });
		expect(paginateFileObjects(items, 0, 0).content).toHaveLength(3);
	});
});

describe("storage normalization", () => {
	it("migrates the legacy folder_order field to OpenList extract_folder", () => {
		expect(normalizeStorageConfig({ ...storage("/a"), folder_order: "before" }).extract_folder).toBe("front");
		expect(normalizeStorageConfig({ ...storage("/a"), folder_order: "after" }).extract_folder).toBe("back");
	});

	it("prefers a native extract_folder value and drops the legacy key", () => {
		const result = normalizeStorageConfig({ ...storage("/a"), folder_order: "after", extract_folder: "front" });
		expect(result.extract_folder).toBe("front");
		expect(result.folder_order).toBeUndefined();
	});

	it("maps legacy values written into the new field name", () => {
		expect(normalizeStorageConfig({ ...storage("/a"), extract_folder: "before" }).extract_folder).toBe("front");
	});

	it("leaves storages without either field untouched", () => {
		expect(normalizeStorageConfig(storage("/a")).extract_folder).toBeUndefined();
	});

	it("falls back to front for values it does not recognise", () => {
		expect(normalizeStorageConfig({ ...storage("/a"), folder_order: "sideways" }).extract_folder).toBe("front");
	});

	it("keeps the OpenList order_by values", () => {
		expect(normalizeStorageConfig({ ...storage("/a"), order_by: "size" }).order_by).toBe("size");
		expect(normalizeStorageConfig({ ...storage("/a"), order_by: "modified" }).order_by).toBe("modified");
		expect(normalizeStorageConfig({ ...storage("/a"), order_by: "" }).order_by).toBe("");
	});

	it("folds the removed created sort field back into the default", () => {
		expect(normalizeStorageConfig({ ...storage("/a"), order_by: "created" }).order_by).toBe("name");
	});

	it("leaves a missing order_by untouched", () => {
		expect(normalizeStorageConfig(storage("/a")).order_by).toBeUndefined();
	});

	it("migrates the legacy webdav_policy spellings", () => {
		expect(normalizeStorageConfig({ ...storage("/a"), webdav_policy: "302" }).webdav_policy).toBe("302_redirect");
		expect(normalizeStorageConfig({ ...storage("/a"), webdav_policy: "proxy" }).webdav_policy).toBe("native_proxy");
	});

	it("keeps the OpenList webdav_policy values", () => {
		expect(normalizeStorageConfig({ ...storage("/a"), webdav_policy: "use_proxy_url" }).webdav_policy).toBe("use_proxy_url");
		expect(normalizeStorageConfig({ ...storage("/a"), webdav_policy: "" }).webdav_policy).toBe("");
	});

	it("leaves a missing webdav_policy untouched", () => {
		expect(normalizeStorageConfig(storage("/a")).webdav_policy).toBeUndefined();
	});
});

describe("virtual mount masks", () => {
	it("locks a mount that sits directly under the parent", async () => {
		const kv = kvWithStorages([storage("/mounts/first", 1)]);
		const [mount] = await listVirtualMounts(kv, "/mounts");
		expect(mount.name).toBe("first");
		expect(mount.mask).toBe(OBJ_LOCKED | ObjMask.Virtual);
	});

	it("makes a directory that only leads to a deeper mount read-only", async () => {
		const kv = kvWithStorages([storage("/mounts/deep/nested", 1)]);
		const [mount] = await listVirtualMounts(kv, "/mounts");
		expect(mount.name).toBe("deep");
		expect(mount.mask).toBe(OBJ_READ_ONLY | ObjMask.Virtual);
	});

	it("upgrades an intermediate name once a mount lands directly on it", async () => {
		const kv = kvWithStorages([storage("/mounts/deep/one", 1), storage("/mounts/deep", 2)]);
		const [mount] = await listVirtualMounts(kv, "/mounts");
		expect(mount.mask).toBe(OBJ_LOCKED | ObjMask.Virtual);
	});

	it("keeps one entry per name and keeps the first mount's order", async () => {
		const kv = kvWithStorages([storage("/mounts/deep/b", 2), storage("/mounts/deep/a", 1)]);
		const mounts = await listVirtualMounts(kv, "/mounts");
		expect(mounts).toHaveLength(1);
		expect(mounts[0]).toMatchObject({ name: "deep", mask: OBJ_READ_ONLY | ObjMask.Virtual });
	});

	it("excludes the parent itself and mounts outside it", async () => {
		const kv = kvWithStorages([storage("/mounts", 1), storage("/other", 2), storage("/mounts/inner", 3)]);
		const mounts = await listVirtualMounts(kv, "/mounts");
		expect(mounts.map((mount) => mount.name)).toEqual(["inner"]);
	});

	it("marks virtual entries so clients can tell them apart", async () => {
		const kv = kvWithStorages([storage("/mounts/first", 1)]);
		const [mount] = await listVirtualMounts(kv, "/mounts");
		expect(mount.mask! & ObjMask.Virtual).toBeTruthy();
		expect(mount.mask! & ObjMask.NoRemove).toBeTruthy();
		expect(mount.mask! & ObjMask.NoWrite).toBeFalsy();
	});
});

describe("storage selection", () => {
	it("counts mount depth in segments", () => {
		expect([mountDepth("/"), mountDepth("/a"), mountDepth("/a/b")]).toEqual([0, 1, 2]);
	});

	it("matches a root mount for every path", () => {
		expect(selectStorage([storage("/")], "/anything/deep/file.txt")?.mount_path).toBe("/");
	});

	it("prefers a specific mount over the root mount", () => {
		expect(selectStorage([storage("/"), storage("/a")], "/a/b.txt")?.mount_path).toBe("/a");
	});

	it("matches a mount path itself and anything below it", () => {
		expect(selectStorage([storage("/a")], "/a")?.mount_path).toBe("/a");
		expect(selectStorage([storage("/a")], "/a/b.txt")?.mount_path).toBe("/a");
	});

	it("prefers the deepest of several nested mounts", () => {
		const configs = [storage("/a"), storage("/a/b"), storage("/a/b/c")];
		expect(selectStorage(configs, "/a/b/c/file.txt")?.mount_path).toBe("/a/b/c");
		expect(selectStorage(configs, "/a/b/other.txt")?.mount_path).toBe("/a/b");
		expect(selectStorage(configs, "/a/top.txt")?.mount_path).toBe("/a");
	});

	it("does not treat /ab as a child of /a", () => {
		expect(selectStorage([storage("/a")], "/ab")).toBeUndefined();
		expect(selectStorage([storage("/a")], "/abc/d.txt")).toBeUndefined();
	});

	it("falls back to an outer mount when the nested one is disabled", () => {
		expect(selectStorage([storage("/a"), storage("/a/b", 0, true)], "/a/b/c.txt")?.mount_path).toBe("/a");
	});

	it("returns nothing when every candidate is disabled", () => {
		expect(selectStorage([storage("/a", 0, true)], "/a/b")).toBeUndefined();
	});

	it("ignores paths outside every mount", () => {
		expect(selectStorage([storage("/a")], "/b/c.txt")).toBeUndefined();
	});
});

describe("storage addition validation", () => {
	it("requires driver-specific fields", () => {
		expect(hasValidStorageAddition({ driver: "openlist", addition: JSON.stringify({ base_url: "https://list.example" }) })).toBe(true);
		expect(hasValidStorageAddition({ driver: "openlist", addition: "{}" })).toBe(false);
		expect(hasValidStorageAddition({ driver: "object", addition: JSON.stringify({ endpoint: "https://s3.example", bucket: "bucket", access_key_id: "key", secret_access_key: "secret" }) })).toBe(true);
		expect(hasValidStorageAddition({ driver: "object", addition: JSON.stringify({ endpoint: "https://s3.example" }) })).toBe(false);
		expect(hasValidStorageAddition({ driver: "webdav", addition: JSON.stringify({ address: "https://dav.example" }) })).toBe(true);
		expect(hasValidStorageAddition({ driver: "webdav", addition: "not-json" })).toBe(false);
	});
});

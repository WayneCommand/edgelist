import { describe, expect, it } from "vitest";
import type { StorageConfig } from "./types";
import { listVirtualMounts, mergeFileObjects, paginateFileObjects } from "./config";

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
		disable_index: false,
		enable_sign: false,
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

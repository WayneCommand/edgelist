import { describe, expect, it } from "vitest";
import { isStorageConfig, normalizeStorageConfig } from "./config";
import { relativeStoragePath } from "./factory";
import { ObjMask, OBJ_LOCKED, OBJ_READ_ONLY, normalizePath } from "./types";

describe("storage paths", () => {
	it("normalizes traversal and duplicate separators", () => {
		expect(normalizePath("/photos//summer/../winter/./a.jpg")).toBe("/photos/winter/a.jpg");
		expect(normalizePath("../../")).toBe("/");
	});

	it("keeps paths relative to a mount", () => {
		expect(relativeStoragePath("/photos", "/photos/a.jpg")).toBe("/a.jpg");
		expect(() => relativeStoragePath("/photos", "/other/a.jpg")).toThrow("outside storage mount");
	});
});

describe("object mask", () => {
	it("matches the OpenList bit positions", () => {
		expect([
			ObjMask.Virtual,
			ObjMask.NoRename,
			ObjMask.NoRemove,
			ObjMask.NoMove,
			ObjMask.NoCopy,
			ObjMask.NoWrite,
			ObjMask.Temp,
		]).toEqual([1, 2, 4, 8, 16, 32, 64]);
	});

	it("composes Locked and ReadOnly the way OpenList does", () => {
		expect(OBJ_LOCKED).toBe(ObjMask.NoRename | ObjMask.NoRemove | ObjMask.NoMove);
		expect(OBJ_LOCKED).toBe(14);
		expect(OBJ_READ_ONLY).toBe(OBJ_LOCKED | ObjMask.NoWrite);
		expect(OBJ_READ_ONLY).toBe(46);
	});
});

describe("storage configuration", () => {
	it("accepts only supported drivers", () => {
		expect(isStorageConfig({ mount_path: "/files", driver: "object" })).toBe(true);
		expect(isStorageConfig({ mount_path: "/files", driver: "S3" })).toBe(true);
		expect(isStorageConfig({ mount_path: "/files", driver: "s3" })).toBe(true);
		expect(
			normalizeStorageConfig({
				mount_path: "/files",
				driver: "WebDav",
				addition: '{"address":"https://dav.example"}',
			} as never),
		).toMatchObject({ driver: "webdav", addition: '{"address":"https://dav.example","url":"https://dav.example"}' });
		expect(
			normalizeStorageConfig({
				mount_path: "/files",
				driver: "OpenList",
				addition: '{"url":"https://list.example"}',
			} as never),
		).toMatchObject({
			driver: "openlist",
			addition: '{"url":"https://list.example","base_url":"https://list.example"}',
		});
		expect(isStorageConfig({ mount_path: "/files", driver: "minio" })).toBe(false);
		expect(isStorageConfig({ driver: "webdav" })).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { isStorageConfig } from "./config";
import { relativeStoragePath } from "./factory";
import { normalizePath } from "./types";

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

describe("storage configuration", () => {
	it("accepts only supported drivers", () => {
		expect(isStorageConfig({ mount_path: "/files", driver: "object" })).toBe(true);
		expect(isStorageConfig({ mount_path: "/files", driver: "s3" })).toBe(false);
		expect(isStorageConfig({ driver: "webdav" })).toBe(false);
	});
});

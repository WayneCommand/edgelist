import { describe, expect, it } from "vitest";
import { hasValidStorageAddition } from "./config";
import { DRIVERS, DRIVER_ITEM_TYPES, findDriver } from "./registry";

describe("driver registry", () => {
	it("finds a driver by EdgeList key or by OpenList name", () => {
		expect(findDriver("object")?.name).toBe("S3");
		expect(findDriver("s3")?.key).toBe("object");
		expect(findDriver("WebDav")?.key).toBe("webdav");
		expect(findDriver("openlist")?.name).toBe("OpenList");
		expect(findDriver("nope")).toBeUndefined();
	});

	it("uses only the OpenList item types", () => {
		for (const driver of DRIVERS) {
			expect(driver.items.length).toBeGreaterThan(0);
			for (const item of driver.items) expect(DRIVER_ITEM_TYPES).toContain(item.type);
		}
	});

	it("declares exactly the required fields the storage validation needs", () => {
		for (const driver of DRIVERS) {
			const filled = Object.fromEntries(driver.items.map((item) => [item.name, item.default || "value"]));
			expect(hasValidStorageAddition({ driver: driver.key, addition: JSON.stringify(filled) })).toBe(true);
			for (const item of driver.items.filter((entry) => entry.required)) {
				const partial = { ...filled };
				delete partial[item.name];
				expect(hasValidStorageAddition({ driver: driver.key, addition: JSON.stringify(partial) })).toBe(false);
			}
		}
	});

	it("keeps the WebDAV TLS bypass out of the form", () => {
		const webdav = findDriver("webdav");
		expect(webdav?.items.map((item) => item.name)).not.toContain("skip_tls_verify");
	});
});

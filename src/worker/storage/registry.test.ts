import { describe, expect, it } from "vitest";
// `?raw` rather than `node:fs`: the worker project deliberately excludes the
// Node type definitions, so that nothing in `src/worker` can quietly reach for
// an API the Workers runtime does not have.
import openlistSource from "./openlist.ts?raw";
import { hasValidStorageAddition } from "./config";
import cacheSource from "./cache.ts?raw";
import { DRIVERS, DRIVER_ITEM_TYPES, findDriver, getDriverInfo } from "./registry";
import s3Source from "./s3.ts?raw";
import webdavSource from "./webdav.ts?raw";
import { OpenListAdapter } from "./openlist";
import { S3Adapter } from "./s3";
import { WebdavAdapter } from "./webdav";
import type { StorageConfig } from "./types";

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
			expect(driver.additionalItems.length).toBeGreaterThan(0);
			for (const item of driver.additionalItems) expect(DRIVER_ITEM_TYPES).toContain(item.type);
		}
	});

	it("declares exactly the required fields the storage validation needs", () => {
		for (const driver of DRIVERS) {
			const filled = Object.fromEntries(driver.additionalItems.map((item) => [item.name, item.default || "value"]));
			expect(hasValidStorageAddition({ driver: driver.key, addition: JSON.stringify(filled) })).toBe(true);
			for (const item of driver.additionalItems.filter((entry) => entry.required)) {
				const partial = { ...filled };
				delete partial[item.name];
				expect(hasValidStorageAddition({ driver: driver.key, addition: JSON.stringify(partial) })).toBe(false);
			}
		}
	});

	it("keeps the WebDAV TLS bypass out of the form", () => {
		const webdav = findDriver("webdav");
		expect(webdav?.additionalItems.map((item) => item.name)).not.toContain("skip_tls_verify");
	});
});

/**
 * A declared item the adapter never reads is a form control that changes
 * nothing, which is the failure mode this whole registry exists to prevent —
 * so the declaration is checked against the implementation rather than trusted.
 */
describe("every declared field is a field something reads", () => {
	const ADAPTER_SOURCE: Record<string, string> = {
		object: s3Source,
		webdav: webdavSource,
		openlist: openlistSource,
	};

	it("names each item somewhere in its own adapter", () => {
		for (const driver of DRIVERS) {
			const source = ADAPTER_SOURCE[driver.key];
			expect(source, `no adapter source mapped for ${driver.key}`).toBeDefined();
			for (const item of driver.additionalItems) {
				expect(source.includes(item.name), `${driver.key} declares "${item.name}" but its adapter never reads it`).toBe(
					true,
				);
			}
		}
	});

	/**
	 * The common items are shared, so they are not covered by the per-adapter
	 * guard above — a common field is read by a module, not by a driver. The
	 * cache pair is read by `storage/cache.ts`; the same check applies to it,
	 * because the Phase 0 rule ("a control that changes nothing is a lie") is
	 * what allowed these two back into the form.
	 */
	it("reads the cache fields in the module that implements them", () => {
		// The form has to offer them first, or the check below passes vacuously.
		const offered = getDriverInfo(findDriver("object")!).common.map((item) => item.name);
		for (const name of ["cache_expiration", "custom_cache_policies"]) {
			expect(offered, `the form no longer offers "${name}"`).toContain(name);
			expect(cacheSource.includes(name), `the form offers "${name}" but storage/cache.ts never reads it`).toBe(true);
		}
	});
});

describe("getDriverInfo", () => {
	it("includes common items with localSort drivers", () => {
		const info = getDriverInfo(findDriver("object")!);
		expect(info.common.map((item) => item.name)).toContain("order_by");
		expect(info.common.map((item) => item.name)).toContain("extract_folder");
		expect(info.common.map((item) => item.name)).toContain("mount_path");
	});

	it("declares the cache fields exactly when the driver caches", () => {
		for (const driver of DRIVERS) {
			const names = getDriverInfo(driver).common.map((item) => item.name);
			// A driver that declares `noCache` must not offer a control that
			// cannot change anything, which is the same rule as everywhere else.
			if (driver.config.noCache) {
				expect(names, `${driver.key} declares noCache`).not.toContain("cache_expiration");
				expect(names, `${driver.key} declares noCache`).not.toContain("custom_cache_policies");
			} else {
				expect(names, `${driver.key} caches`).toContain("cache_expiration");
				expect(names, `${driver.key} caches`).toContain("custom_cache_policies");
			}
		}
	});

	it("keeps the fields nothing reads out of the form", () => {
		for (const driver of DRIVERS) {
			const info = getDriverInfo(driver);
			const allNames = [...info.common, ...info.additional].map((item) => item.name);
			expect(allNames).not.toContain("disable_index");
			expect(allNames).not.toContain("enable_sign");
			expect(allNames).not.toContain("web_proxy");
			expect(allNames).not.toContain("down_proxy_url");
			expect(allNames).not.toContain("disable_proxy_sign");
			expect(allNames).not.toContain("webdav_policy");
		}
	});

	it("gives cache_expiration OpenList's required default of 30 minutes", () => {
		const item = getDriverInfo(findDriver("object")!).common.find((entry) => entry.name === "cache_expiration");
		expect(item).toMatchObject({ type: "number", default: "30", required: true });
	});

	it("returns correct structure", () => {
		const info = getDriverInfo(findDriver("openlist")!);
		expect(info.name).toBe("OpenList");
		expect(info.config).toBeDefined();
		expect(Array.isArray(info.common)).toBe(true);
		expect(Array.isArray(info.additional)).toBe(true);
	});

	it("carries the storage key so the UI can match a storage to its driver", () => {
		// A storage stores `object`/`webdav`/`openlist`, not the display name, so
		// the name alone cannot be used to look a definition back up.
		for (const driver of DRIVERS) {
			expect(getDriverInfo(driver).key).toBe(driver.key);
		}
		expect(getDriverInfo(findDriver("object")!).key).toBe("object");
	});

	it("marks every credential as secret so the form can mask it", () => {
		const secrets = (driver: string) =>
			findDriver(driver)!
				.additionalItems.filter((item) => item.secret)
				.map((item) => item.name);
		expect(secrets("object")).toEqual(["secret_access_key", "session_token"]);
		expect(secrets("webdav")).toEqual(["password"]);
		expect(secrets("openlist")).toEqual(["token", "password"]);
	});
});

describe("adapter capabilities match registry", () => {
	const mockConfig = (driver: string, addition: Record<string, unknown>): StorageConfig => ({
		id: 1,
		mount_path: "/test",
		order: 0,
		driver: driver as StorageConfig["driver"],
		status: "work",
		addition: JSON.stringify(addition),
		remark: "",
		disabled: false,
	});

	it("S3Adapter capabilities match registry", () => {
		const adapter = new S3Adapter(
			mockConfig("object", {
				endpoint: "https://s3.example.com",
				bucket: "test",
				access_key_id: "key",
				secret_access_key: "secret",
			}),
		);
		const registry = findDriver("object")!;
		expect([...adapter.capabilities]).toEqual([...registry.capabilities]);
	});

	it("WebdavAdapter capabilities match registry", () => {
		const adapter = new WebdavAdapter(
			mockConfig("webdav", {
				url: "https://webdav.example.com",
			}),
		);
		const registry = findDriver("webdav")!;
		expect([...adapter.capabilities]).toEqual([...registry.capabilities]);
	});

	it("OpenListAdapter capabilities match registry", () => {
		const adapter = new OpenListAdapter(
			mockConfig("openlist", {
				base_url: "https://openlist.example.com",
			}),
		);
		const registry = findDriver("openlist")!;
		expect([...adapter.capabilities]).toEqual([...registry.capabilities]);
	});
});

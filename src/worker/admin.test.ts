import { describe, expect, it } from "vitest";
import { removeByIdentity } from "./admin";
import { DRIVERS, findDriver, getDriverInfo } from "./storage/registry";

describe("admin identity deletion", () => {
	it("removes only the selected storage when ids are duplicated or absent", () => {
		const storages = [{ id: 0, mount_path: "/one" }, { id: 0, mount_path: "/two" }];
		expect(removeByIdentity(storages, "mount_path", "/one")).toEqual([{ id: 0, mount_path: "/two" }]);
	});
});

describe("driver endpoints", () => {
	it("driverNames returns all driver names", () => {
		const names = DRIVERS.map((d) => d.name);
		expect(names).toContain("S3");
		expect(names).toContain("WebDav");
		expect(names).toContain("OpenList");
	});

	it("driverList returns all drivers with common and additional items", () => {
		const list = DRIVERS.map(getDriverInfo);
		expect(list.length).toBe(3);
		for (const info of list) {
			expect(info.common.length).toBeGreaterThan(0);
			expect(info.additional.length).toBeGreaterThan(0);
		}
	});

	it("driverInfo returns info for valid driver", () => {
		const driver = findDriver("s3");
		expect(driver).toBeDefined();
		const info = getDriverInfo(driver!);
		expect(info.name).toBe("S3");
		expect(info.common.some((item) => item.name === "mount_path")).toBe(true);
	});

	it("driverInfo returns undefined for invalid driver", () => {
		const driver = findDriver("invalid");
		expect(driver).toBeUndefined();
	});
});

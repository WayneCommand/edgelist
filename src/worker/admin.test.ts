import { describe, expect, it } from "vitest";
import { removeByIdentity } from "./admin";

describe("admin identity deletion", () => {
	it("removes only the selected storage when ids are duplicated or absent", () => {
		const storages = [{ id: 0, mount_path: "/one" }, { id: 0, mount_path: "/two" }];
		expect(removeByIdentity(storages, "mount_path", "/one")).toEqual([{ id: 0, mount_path: "/two" }]);
	});
});

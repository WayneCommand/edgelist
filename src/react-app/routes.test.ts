import { describe, expect, it } from "vitest";
import { routeFor } from "./routes";

describe("frontend routes", () => {
	it("maps storage paths to the files view", () => {
		expect(routeFor("/")).toEqual({ kind: "files", path: "/" });
		expect(routeFor("/ibm/backup/")).toEqual({ kind: "files", path: "/ibm/backup" });
	});

	it("maps management paths to their views", () => {
		expect(routeFor("/@manage/storages")).toEqual({ kind: "storages" });
		expect(routeFor("/@manage/metadata/")).toEqual({ kind: "metadata" });
		expect(routeFor("/@manage/backup-restore")).toEqual({ kind: "backup" });
	});
});

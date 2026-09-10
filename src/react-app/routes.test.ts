import { describe, expect, it } from "vitest";
import { ROUTES, filesPathFor, routeFor } from "./routes";

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

	it("routes the sign-in page like OpenList", () => {
		expect(routeFor(ROUTES.login)).toEqual({ kind: "login" });
		expect(filesPathFor(ROUTES.login)).toBe("/");
	});

	it("keeps management paths out of the file path", () => {
		expect(filesPathFor(ROUTES.storages)).toBe("/");
		expect(filesPathFor("/ibm/backup/")).toBe("/ibm/backup");
	});
});

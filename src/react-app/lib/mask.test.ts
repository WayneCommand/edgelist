import { describe, expect, it } from "vitest";
import { OBJ_LOCKED, OBJ_READ_ONLY, ObjMask, isMountLayer, permissionsFor } from "./mask";
import { parentOf } from "./paths";
import type { FileItem } from "./types";

function file(overrides: Partial<FileItem> = {}): FileItem {
	return { name: "a.txt", size: 1, is_dir: false, modified: "", path: "/a.txt", ...overrides };
}

describe("parentOf", () => {
	it("walks up one level", () => {
		expect(parentOf("/a/b/c")).toBe("/a/b");
		expect(parentOf("/a")).toBe("/");
		expect(parentOf("/")).toBe("/");
	});
});

describe("permissionsFor a plain entry", () => {
	it("allows everything a file can do", () => {
		const permissions = permissionsFor([file()]);
		for (const action of ["open", "rename", "copy", "move", "remove", "download", "link"] as const) {
			expect(permissions[action]).toEqual({ allowed: true });
		}
	});

	it("has no link and no download for a directory", () => {
		const permissions = permissionsFor([file({ is_dir: true, path: "/docs" })]);
		expect(permissions.link).toEqual({ allowed: false, reason: "Folders have no link" });
		expect(permissions.download).toEqual({ allowed: false, reason: "Archives are not supported yet" });
		// A directory can still be renamed, moved and copied.
		expect(permissions.rename.allowed).toBe(true);
		expect(permissions.move.allowed).toBe(true);
	});

	it("denies everything when nothing is selected", () => {
		const permissions = permissionsFor([]);
		for (const action of ["open", "rename", "copy", "move", "remove", "download", "link"] as const) {
			expect(permissions[action].allowed).toBe(false);
		}
	});
});

describe("permissionsFor and the mask", () => {
	it("locks a mount point down to writing through it", () => {
		// A direct mount point is `OBJ_LOCKED | Virtual`.
		const mount = file({ is_dir: true, path: "/waynecos", mask: OBJ_LOCKED | ObjMask.Virtual });
		const permissions = permissionsFor([mount]);
		expect(permissions.rename.reason).toBe("This item cannot be renamed");
		expect(permissions.remove.reason).toBe("This item cannot be deleted");
		expect(permissions.move.allowed).toBe(false);
		// Virtual mounts carry no `NoCopy`, so the refusal has to be the client's own.
		expect(permissions.copy.reason).toBe("Mounted storages cannot be transferred");
	});

	it("treats an intermediate mount level as read-only too", () => {
		const layer = file({ is_dir: true, path: "/a", mask: OBJ_READ_ONLY | ObjMask.Virtual });
		const permissions = permissionsFor([layer]);
		expect(permissions.rename.allowed).toBe(false);
		expect(permissions.remove.allowed).toBe(false);
		expect(permissions.copy.allowed).toBe(false);
	});

	it("keeps copy and move independent", () => {
		const noCopy = permissionsFor([file({ mask: ObjMask.NoCopy })]);
		expect(noCopy.copy.reason).toBe("This item cannot be copied");
		expect(noCopy.move.allowed).toBe(true);

		const noMove = permissionsFor([file({ mask: ObjMask.NoMove })]);
		expect(noMove.move.reason).toBe("This item cannot be moved");
		expect(noMove.copy.allowed).toBe(true);
	});

	it("blocks a move on NoRemove alone, because a move deletes the original", () => {
		const permissions = permissionsFor([file({ mask: ObjMask.NoRemove })]);
		expect(permissions.remove.allowed).toBe(false);
		expect(permissions.move.reason).toBe("Moving removes the original, which this item forbids");
		expect(permissions.copy.allowed).toBe(true);
	});

	it("lets one locked entry block a whole batch", () => {
		const permissions = permissionsFor([
			file({ path: "/a.txt" }),
			file({ name: "b", path: "/b", mask: ObjMask.NoCopy }),
		]);
		expect(permissions.copy.allowed).toBe(false);
		expect(permissions.remove.allowed).toBe(true);
	});
});

describe("permissionsFor a multi-selection", () => {
	const one = file({ name: "a", path: "/dir/a" });
	const two = file({ name: "b", path: "/dir/b" });

	it("keeps rename to a single entry", () => {
		expect(permissionsFor([one, two]).rename).toEqual({
			allowed: false,
			reason: "Rename works on one entry at a time",
		});
	});

	it("allows transfer and removal inside one folder", () => {
		const permissions = permissionsFor([one, two]);
		expect(permissions.copy.allowed).toBe(true);
		expect(permissions.move.allowed).toBe(true);
		expect(permissions.remove.allowed).toBe(true);
		expect(permissions.download.allowed).toBe(true);
	});

	it("refuses a transfer across folders, which is what a search returns", () => {
		const permissions = permissionsFor([one, file({ name: "c", path: "/other/c" })]);
		expect(permissions.copy.reason).toBe("Copy needs entries from a single folder");
		expect(permissions.move.reason).toBe("Move needs entries from a single folder");
		// Removal groups by parent, so it still works.
		expect(permissions.remove.allowed).toBe(true);
	});

	it("refuses to download a batch containing a folder", () => {
		const permissions = permissionsFor([one, file({ name: "d", is_dir: true, path: "/dir/d" })]);
		expect(permissions.download.reason).toBe("Archives are not supported yet");
	});
});

describe("isMountLayer", () => {
	const mounts = ["/waynecos", "/a/b/c"];

	it("recognises the levels a nested mount created", () => {
		expect(isMountLayer("/a", mounts)).toBe(true);
		expect(isMountLayer("/a/b", mounts)).toBe(true);
	});

	it("leaves a real mount alone", () => {
		expect(isMountLayer("/a/b/c", mounts)).toBe(false);
		expect(isMountLayer("/waynecos", mounts)).toBe(false);
	});

	it("leaves an unrelated path alone", () => {
		expect(isMountLayer("/other", mounts)).toBe(false);
		// A string prefix is not a path prefix.
		expect(isMountLayer("/a-b", mounts)).toBe(false);
	});

	it("treats a nested mount under the root as a layer boundary", () => {
		expect(isMountLayer("/", ["/waynecos"])).toBe(true);
		expect(isMountLayer("/", ["/"])).toBe(false);
	});
});

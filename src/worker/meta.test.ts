import { describe, it, expect } from "vitest";
import { canAccess, canWrite, getNearestMeta, type MetaConfig } from "./meta";
import { ObjMask } from "./storage/types";

function createMeta(overrides: Partial<MetaConfig> = {}): MetaConfig {
	return { id: 1, path: "/test", ...overrides };
}

describe("canAccess", () => {
	it("should allow access when user is null", () => {
		expect(canAccess(null, createMeta(), "/test/file.txt")).toBe(true);
	});

	it("should allow access when meta is null", () => {
		expect(canAccess({ id: 1, permission: 0 }, null, "/test/file.txt")).toBe(true);
	});

	it("should deny access when file matches hide pattern (h_sub=true)", () => {
		const meta = createMeta({ path: "/test", hide: ".*secret.*", h_sub: true });
		const user = { id: 1, permission: 0 };
		// pathDir("/test/secret.txt") = "/test", metaCoversPath("/test", "/test", true) = true
		expect(canAccess(user, meta, "/test/secret.txt", undefined)).toBe(false);
	});

	it("should deny access when file in subfolder matches hide pattern", () => {
		const meta = createMeta({ path: "/test", hide: ".*secret.*", h_sub: true });
		const user = { id: 1, permission: 0 };
		// pathDir("/test/sub/secret.txt") = "/test/sub", metaCoversPath("/test", "/test/sub", true) = true
		expect(canAccess(user, meta, "/test/sub/secret.txt", undefined)).toBe(false);
	});

	it("should allow access when file does not match hide pattern", () => {
		const meta = createMeta({ path: "/test", hide: ".*secret.*", h_sub: true });
		const user = { id: 1, permission: 0 };
		expect(canAccess(user, meta, "/test/file.txt", undefined)).toBe(true);
	});

	it("should allow access when h_sub is false", () => {
		const meta = createMeta({ path: "/test", hide: ".*secret.*", h_sub: false });
		const user = { id: 1, permission: 0 };
		expect(canAccess(user, meta, "/test/secret.txt", undefined)).toBe(true);
	});

	it("should allow access when user has admin permission (bit 2 set)", () => {
		const meta = createMeta({ password: "abc", p_sub: true });
		const user = { id: 1, permission: 2 };
		expect(canAccess(user, meta, "/test/file.txt", undefined)).toBe(true);
	});

	it("should deny access when password required, wrong password, non-admin", () => {
		const meta = createMeta({ password: "abc", p_sub: true });
		const user = { id: 1, permission: 0 };
		expect(canAccess(user, meta, "/test/file.txt", "wrong")).toBe(false);
	});

	it("should deny access when password required, no password, non-admin", () => {
		const meta = createMeta({ password: "abc", p_sub: true });
		const user = { id: 1, permission: 0 };
		expect(canAccess(user, meta, "/test/file.txt", undefined)).toBe(false);
	});

	it("should allow access when correct password provided", () => {
		const meta = createMeta({ password: "abc", p_sub: true });
		const user = { id: 1, permission: 0 };
		expect(canAccess(user, meta, "/test/file.txt", "abc")).toBe(true);
	});

	it("should allow access when path outside password scope (p_sub=false)", () => {
		const meta = createMeta({ password: "abc", p_sub: false });
		const user = { id: 1, permission: 0 };
		// metaCoversPath("/test", "/other/file.txt", false) = false => allow
		expect(canAccess(user, meta, "/other/file.txt", undefined)).toBe(true);
	});

	it("should allow access when no password set", () => {
		const meta = createMeta({});
		const user = { id: 1, permission: 0 };
		expect(canAccess(user, meta, "/test/file.txt", undefined)).toBe(true);
	});

	it("should deny access when read_users excludes user", () => {
		const meta = createMeta({ read_users: [1], read_users_sub: true });
		const user = { id: 2, permission: 0 };
		expect(canAccess(user, meta, "/test/file.txt", undefined)).toBe(false);
	});

	it("should allow access when read_users includes user", () => {
		const meta = createMeta({ read_users: [1], read_users_sub: true });
		const user = { id: 1, permission: 0 };
		expect(canAccess(user, meta, "/test/file.txt", undefined)).toBe(true);
	});

	it("should allow access when read_users_sub is false and path is child", () => {
		const meta = createMeta({ read_users: [1], read_users_sub: false });
		const user = { id: 2, permission: 0 };
		// metaCoversPath("/test", "/test/file.txt", false) = false => not covered => allow
		expect(canAccess(user, meta, "/test/file.txt", undefined)).toBe(true);
	});
});

describe("canWrite", () => {
	it("should allow write when meta is null and user is null", () => {
		expect(canWrite(null, null, "/test")).toBe(true);
	});

	it("should allow write when user has permission", () => {
		expect(canWrite({ id: 1, permission: 3 }, null, "/test")).toBe(true);
	});

	it("should allow write when no write_users set", () => {
		expect(canWrite({ id: 1, permission: 3 }, createMeta(), "/test/file.txt")).toBe(true);
	});

	it("should allow write when user is in write_users list", () => {
		const meta = createMeta({ write_users: [1, 2], write_users_sub: true });
		expect(canWrite({ id: 1, permission: 3 }, meta, "/test/file.txt")).toBe(true);
	});

	it("should deny write when write=false and w_sub covers path", () => {
		const meta = createMeta({ write: false, w_sub: true });
		expect(canWrite({ id: 1, permission: 3 }, meta, "/test/file.txt")).toBe(false);
	});

	it("should allow write when write=false but w_sub does not cover path", () => {
		const meta = createMeta({ write: false, w_sub: true });
		expect(canWrite({ id: 1, permission: 3 }, meta, "/other/file.txt")).toBe(true);
	});

	it("should allow write when write=true and w_sub covers path", () => {
		const meta = createMeta({ write: true, w_sub: true });
		expect(canWrite({ id: 1, permission: 3 }, meta, "/test/file.txt")).toBe(true);
	});

	it("should deny write when write_users excludes user", () => {
		const meta = createMeta({ write_users: [1, 2], write_users_sub: true });
		expect(canWrite({ id: 3, permission: 3 }, meta, "/test/file.txt")).toBe(false);
	});

	it("should deny write when write=false AND write_users excludes user", () => {
		const meta = createMeta({ write: false, w_sub: true, write_users: [1, 2], write_users_sub: true });
		expect(canWrite({ id: 3, permission: 3 }, meta, "/test/file.txt")).toBe(false);
	});
});

describe("getNearestMeta", () => {
	it("should return null when no metas config exists", async () => {
		const kv = { get: async () => null } as unknown as KVNamespace;
		expect(await getNearestMeta(kv, "/test")).toBeNull();
	});

	it("should find exact match", async () => {
		const metas = [{ id: 1, path: "/docs" }, { id: 2, path: "/docs/secret" }];
		const kv = { get: async () => metas } as unknown as KVNamespace;
		const result = await getNearestMeta(kv, "/docs/secret");
		expect(result?.id).toBe(2);
	});

	it("should find nearest parent", async () => {
		const kv = { get: async () => [{ id: 1, path: "/docs" }] } as unknown as KVNamespace;
		const result = await getNearestMeta(kv, "/docs/deep/file.txt");
		expect(result?.id).toBe(1);
	});

	it("should return null for root path when no root meta", async () => {
		const kv = { get: async () => [{ id: 1, path: "/docs" }] } as unknown as KVNamespace;
		expect(await getNearestMeta(kv, "/")).toBeNull();
	});
});

describe("ObjMask constants", () => {
	it("should have correct mask values", () => {
		expect(ObjMask.Virtual).toBe(1 << 0);
		expect(ObjMask.NoRename).toBe(1 << 1);
		expect(ObjMask.NoRemove).toBe(1 << 2);
		expect(ObjMask.NoMove).toBe(1 << 3);
		expect(ObjMask.NoCopy).toBe(1 << 4);
		expect(ObjMask.NoWrite).toBe(1 << 5);
	});

	it("should support bitwise operations", () => {
		const mask = ObjMask.NoRename | ObjMask.NoWrite;
		expect(mask & ObjMask.NoRename).toBeTruthy();
		expect(mask & ObjMask.NoWrite).toBeTruthy();
		expect(mask & ObjMask.NoRemove).toBeFalsy();
	});
});

import { describe, expect, it } from "vitest";
import type { FileObject, StorageAdapter, StorageConfig, TransferOptions } from "./storage/types";
import { joinPath, normalizePath } from "./storage/types";
import { planTransfers, type TransferPlannerDependencies } from "./fs-transfer";

function config(mountPath: string): StorageConfig {
	return { id: mountPath.length, mount_path: mountPath, order: 0, driver: "object", status: "work", addition: "{}", remark: "", disabled: false };
}

function object(path: string, isDir = false): FileObject {
	return { name: normalizePath(path).split("/").pop() ?? "/", size: isDir ? 0 : 4, is_dir: isDir, modified: "", created: "", path: normalizePath(path) };
}

function adapter(mountPath: string, objects: Map<string, FileObject>, capabilities: string[] = ["read", "copy", "move", "merge"]) {
	const calls: Array<{ source: string; destination: string; options: TransferOptions; kind: "copy" | "move" }> = [];
	const resolved = (path: string) => normalizePath(joinPath(mountPath, path));
	const value = {
		mountPath,
		keys: [...objects.keys()],
		resolved,
		calls,
		adapter: {
			driver: "object" as const,
			capabilities: new Set(capabilities as never),
			list: async () => ({ content: [], total: 0 }),
			get: async (path: string) => {
				const found = objects.get(resolved(path));
				if (!found) throw new Error("File not found");
				return { ...found, path: normalizePath(path) };
			},
			read: async () => new Response("read"),
			write: async () => undefined,
			mkdir: async () => undefined,
			remove: async () => undefined,
			rename: async () => undefined,
			copy: async (source: string, destination: string, options: TransferOptions) => {
				calls.push({ source, destination, options, kind: "copy" });
			},
			move: async (source: string, destination: string, options: TransferOptions) => {
				calls.push({ source, destination, options, kind: "move" });
			},
		} satisfies StorageAdapter,
	};
	return value;
}

function dependencies(mounts: Array<ReturnType<typeof adapter>>, mountPaths = mounts.map((_, index) => index === 0 ? "/" : `/mount-${index}`), options: { virtual?: string[]; childMounts?: Record<string, string[]> } = {}): TransferPlannerDependencies {
	const configs = mountPaths.map((mountPath) => config(mountPath));
	const storageFor = (path: string) => [...mounts].map((mount, index) => ({ mount, mountPath: configs[index].mount_path }))
		.sort((left, right) => right.mountPath.length - left.mountPath.length)
		.find((item) => item.mountPath === "/" || normalizePath(path) === item.mountPath || normalizePath(path).startsWith(`${item.mountPath}/`))!;
	return {
		resolve: async (path) => {
			const selected = storageFor(path);
			return {
				config: config(selected.mountPath),
				path: selected.mountPath === "/" ? normalizePath(path) : normalizePath(path).slice(selected.mountPath.length) || "/",
				adapter: selected.mount.adapter,
			};
		},
		isVirtualMount: async (path) => Boolean(options.virtual?.includes(normalizePath(path))),
		listVirtualMounts: async (path) => (options.childMounts?.[normalizePath(path)] ?? []).map((name) => ({ ...object(name, true), name })),
	};
}

function first(mount: ReturnType<typeof adapter>) {
	return mount.calls[0];
}

describe("synchronous same-storage transfers", () => {
	it("copies a file into another directory", async () => {
		const root = adapter("/", new Map([["/file.txt", object("/file.txt")], ["/directory", object("/directory", true)]]));
		const result = await planTransfers("copy", { src_dir: "/", dst_dir: "/directory", names: ["file.txt"] }, dependencies([root]));
		expect(result).toMatchObject({ operation: "copy", accepted: 1, skipped: 0, failed: 0 });
		expect(first(root)).toEqual({ source: "/file.txt", destination: "/directory/file.txt", options: { overwrite: false, merge: false }, kind: "copy" });
	});

	it("supports overwrite, skip, and directory merge policies", async () => {
		const root = adapter("/", new Map([
			["/file.txt", object("/file.txt")],
			["/directory", object("/directory", true)],
			["/directory/file.txt", object("/directory/file.txt")],
			["/source-dir", object("/source-dir", true)],
			["/target-dir", object("/target-dir", true)],
			["/target-dir/source-dir", object("/target-dir/source-dir", true)],
		]));
		const deps = dependencies([root], ["/"]);
		await expect(planTransfers("copy", { src_dir: "/", dst_dir: "/directory", names: ["file.txt"], skip_existing: true }, deps)).resolves.toMatchObject({ skipped: 1 });
		await expect(planTransfers("copy", { src_dir: "/", dst_dir: "/directory", names: ["file.txt"], overwrite: true }, deps)).resolves.toMatchObject({ accepted: 1 });
		expect(first(root)?.options.overwrite).toBe(true);

		const merge = await planTransfers("copy", { src_dir: "/", dst_dir: "/target-dir", names: ["source-dir"], merge: true }, deps);
		expect(merge).toMatchObject({ accepted: 1, failed: 0 });
		expect(root.calls.at(-1)).toMatchObject({ kind: "copy", options: { merge: true, overwrite: false } });
	});

	it("rejects cross-storage and mount-boundary targets", async () => {
		const one = adapter("/", new Map([["/file.txt", object("/file.txt")], ["/directory", object("/directory", true)]]));
		const two = adapter("/nested", new Map([["/nested/directory", object("/nested/directory", true)], ["/nested/file.txt", object("/nested/file.txt")]]));
		const deps = dependencies([one, two], ["/", "/nested"], { virtual: ["/group"] });
		const cross = await planTransfers("copy", { src_dir: "/", dst_dir: "/nested/directory", names: ["file.txt"] }, deps);
		expect(cross.failed).toBe(1);
		expect(cross.results[0].error).toBe("跨存储复制/移动不支持");
		expect(cross.results[0].code).toBe("CROSS_STORAGE_TRANSFER");

		await expect(planTransfers("copy", { src_dir: "/", dst_dir: "/group", names: ["file.txt"] }, deps)).rejects.toThrow("Destination is a virtual mount directory");
	});

	it("prevents storage roots, self-nesting, and directories containing mounts", async () => {
		const root = adapter("/", new Map([
			["/file.txt", object("/file.txt")],
			["/folder", object("/folder", true)],
			["/folder/inner", object("/folder/inner", true)],
			["/directory", object("/directory", true)],
		]));
		const deps = dependencies([root], ["/"], { childMounts: { "/folder": ["mounted"] } });

		const nested = await planTransfers("move", { src_dir: "/", dst_dir: "/folder/inner", names: ["folder"] }, deps);
		expect(nested.results[0].error).toBe("A directory cannot be transferred into itself");

		const withMount = await planTransfers("copy", { src_dir: "/", dst_dir: "/directory", names: ["folder"] }, deps);
		expect(withMount.results[0].error).toBe("A directory containing mounted storages cannot be transferred synchronously");

		const nestedRoot = adapter("/nested", new Map([["/nested/directory", object("/nested/directory", true)]]));
		const nestedDeps = dependencies([root, nestedRoot], ["/", "/nested"]);
		const storageRoot = await planTransfers("move", { src_dir: "/", dst_dir: "/nested/directory", names: ["nested"] }, nestedDeps);
		expect(storageRoot.results[0].error).toBe("A storage root cannot be transferred");
	});
});

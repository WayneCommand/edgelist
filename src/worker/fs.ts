import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { planTransfers, type TransferInput, type TransferKind, type TransferPlannerDependencies } from "./fs-transfer";
import { canAccess, canWrite, getNearestMeta, metaHeader, metaReadme } from "./meta";
import {
	getStorageConfig,
	isVirtualMount,
	listVirtualMounts,
	mergeFileObjects,
	paginateFileObjects,
} from "./storage/config";
import { resolveStorage } from "./storage/factory";
import { normalizePath, ObjMask, type FileObject, type StorageConfig } from "./storage/types";
import { applySort, resolveSort } from "./sort";
import { failure, respond } from "./response";

type FsContext = Context<{ Bindings: Env & EdgeListBindings; Variables: { auth: Record<string, unknown> } }>;

async function checkWriteMask(
	c: FsContext,
	path: string,
	maskBit: number,
	errorMessage: string,
	checkParent = false,
): Promise<Response | null> {
	const targetPath = checkParent ? normalizePath(path.split("/").slice(0, -1).join("/") || "/") : path;
	const resolved = await resolveStorage(c.env, targetPath);
	try {
		const file = await resolved.adapter.get(resolved.path);
		if (file.mask && file.mask & maskBit) {
			return failure(errorMessage, 403);
		}
	} catch {
		if (!checkParent) return failure(errorMessage, 403);
	}
	return null;
}

function transferDependencies(c: FsContext): TransferPlannerDependencies {
	return {
		resolve: (path) => resolveStorage(c.env, path),
		isVirtualMount: (path) => isVirtualMount(c.env.EDGE_CONFIG, path),
		listVirtualMounts: (path) => listVirtualMounts(c.env.EDGE_CONFIG, path),
	};
}

async function transfer(c: FsContext, kind: TransferKind) {
	try {
		const input = await body<TransferInput>(c);
		const srcDir = normalizePath(input.src_dir ?? "/");
		const dstDir = normalizePath(input.dst_dir ?? "/");
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const srcMeta = await getNearestMeta(c.env.EDGE_CONFIG, srcDir);
		const dstMeta = await getNearestMeta(c.env.EDGE_CONFIG, dstDir);
		if (!canWrite(user, srcMeta, srcDir) || !canWrite(user, dstMeta, dstDir)) {
			return failure("Access denied", 403);
		}
		return respond(c, await planTransfers(kind, input, transferDependencies(c)));
	} catch (error) {
		return failure(error instanceof Error ? error.message : `Unable to ${kind} paths`, 400);
	}
}

export async function fsCopy(c: FsContext) {
	return transfer(c, "copy");
}

export async function fsMove(c: FsContext) {
	return transfer(c, "move");
}

export function publicFilePath(parentPath: string, name: string) {
	return normalizePath(`${parentPath}/${name}`);
}

async function body<T>(c: FsContext): Promise<T> {
	return c.req.json<T>();
}

export async function fsList(c: FsContext) {
	try {
		const input = await body<{
			path?: string;
			page?: number;
			per_page?: number;
			refresh?: boolean;
			order_by?: string;
			order_direction?: string;
			extract_folder?: string;
			password?: string;
		}>(c);
		const requestedPath = normalizePath(input.path ?? "/");
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, requestedPath);
		if (!canAccess(user, meta, requestedPath, input.password)) {
			return failure("Access denied", 403);
		}
		const virtualMounts = await listVirtualMounts(c.env.EDGE_CONFIG, requestedPath);
		let physicalItems: FileObject[] = [];
		let storage: StorageConfig | undefined;
		try {
			const resolved = await resolveStorage(c.env, input.path ?? "/");
			storage = resolved.config;
			const result = await resolved.adapter.list(resolved.path, {
				page: 1,
				per_page: 0,
				refresh: input.refresh ?? false,
			});
			physicalItems = result.content.map((item) => ({ ...item, path: publicFilePath(requestedPath, item.name) }));
		} catch (error) {
			if (!virtualMounts.length) throw error;
		}
		let allItems = mergeFileObjects(physicalItems, virtualMounts);
		if (meta?.hide && meta.h_sub) {
			const patterns = meta.hide
				.split("\n")
				.filter(Boolean)
				.map((p) => new RegExp(p));
			allItems = allItems.filter((item) => !patterns.some((re) => re.test(item.name)));
		}
		const sorted = applySort(allItems, resolveSort(input, storage));
		// OpenList's `FsListResp` carries these alongside the entries, and the
		// client renders them around the list. They are resolved here rather than
		// in the browser because the rule that owns a path lives in KV.
		const page = paginateFileObjects(sorted, input.page ?? 1, input.per_page ?? 0);
		return respond(c, {
			...page,
			readme: metaReadme(meta, requestedPath),
			header: metaHeader(meta, requestedPath),
		});
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to list path", 400);
	}
}

export async function fsGet(c: FsContext) {
	try {
		const input = await body<{ path?: string; password?: string }>(c);
		const requestedPath = normalizePath(input.path ?? "/");
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, requestedPath);
		if (!canAccess(user, meta, requestedPath, input.password)) {
			return failure("Access denied", 403);
		}
		if (await isVirtualMount(c.env.EDGE_CONFIG, requestedPath)) {
			const segments = requestedPath.split("/").filter(Boolean);
			const name = segments.pop() ?? "/";
			const virtual = (await listVirtualMounts(c.env.EDGE_CONFIG, normalizePath(`/${segments.join("/")}`))).find(
				(item) => item.name === name,
			);
			const fallback: FileObject = {
				name,
				size: 0,
				is_dir: true,
				modified: new Date(0).toISOString(),
				created: new Date(0).toISOString(),
				path: requestedPath,
				mask: 0,
			};
			return respond(c, virtual ?? fallback);
		}
		const resolved = await resolveStorage(c.env, input.path ?? "/");
		return respond(c, await resolved.adapter.get(resolved.path));
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to get path", 404);
	}
}

export async function fsMkdir(c: FsContext) {
	try {
		const input = await body<{ path: string; create_parent?: boolean }>(c);
		const targetPath = normalizePath(input.path);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, targetPath);
		if (!canWrite(user, meta, targetPath)) {
			return failure("Access denied", 403);
		}
		if (input.create_parent) {
			const parts = targetPath.split("/").filter(Boolean);
			for (let i = 1; i <= parts.length; i++) {
				const parentPath = `/${parts.slice(0, i).join("/")}`;
				const parentMeta = await getNearestMeta(c.env.EDGE_CONFIG, parentPath);
				if (!canWrite(user, parentMeta, parentPath)) {
					return failure("Access denied", 403);
				}
				try {
					const resolved = await resolveStorage(c.env, parentPath);
					await resolved.adapter.mkdir(resolved.path);
				} catch (error) {
					if (error instanceof Error && !error.message.includes("already exists")) throw error;
				}
			}
			return respond(c, null);
		}
		const resolved = await resolveStorage(c.env, targetPath);
		await resolved.adapter.mkdir(resolved.path);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to create directory", 400);
	}
}

export async function fsRename(c: FsContext) {
	try {
		const input = await body<{ path: string; name: string; overwrite?: boolean }>(c);
		const targetPath = normalizePath(input.path);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, targetPath);
		if (!canWrite(user, meta, targetPath)) {
			return failure("Access denied", 403);
		}
		const maskError = await checkWriteMask(c, targetPath, ObjMask.NoRename, "Cannot rename this item");
		if (maskError) return maskError;
		const resolved = await resolveStorage(c.env, input.path);
		await resolved.adapter.rename(resolved.path, input.name, input.overwrite ?? false);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to rename path", 400);
	}
}

export async function fsRemove(c: FsContext) {
	try {
		const input = await body<{ dir: string; names: string[] }>(c);
		const dirPath = normalizePath(input.dir);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, dirPath);
		if (!canWrite(user, meta, dirPath)) {
			return failure("Access denied", 403);
		}
		for (const name of input.names) {
			const itemPath = normalizePath(`${input.dir}/${name}`);
			const maskError = await checkWriteMask(c, itemPath, ObjMask.NoRemove, "Cannot remove this item");
			if (maskError) return maskError;
		}
		const results = await Promise.allSettled(
			input.names.map(async (name) => {
				const resolved = await resolveStorage(c.env, normalizePath(`${input.dir}/${name}`));
				await resolved.adapter.remove(resolved.path);
				return name;
			}),
		);
		const removed: string[] = [];
		const failed: Array<{ name: string; error: string }> = [];
		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const name = input.names[i];
			if (result.status === "fulfilled") {
				removed.push(name);
			} else {
				failed.push({ name, error: result.reason instanceof Error ? result.reason.message : "Unknown error" });
			}
		}
		return respond(c, { removed, failed });
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to remove path", 400);
	}
}

export async function fsPut(c: FsContext) {
	try {
		const filePath = c.req.header("File-Path");
		if (!filePath) return failure("File-Path header is required", 400);
		const targetPath = normalizePath(decodeURIComponent(filePath));
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, targetPath);
		if (!canWrite(user, meta, targetPath)) {
			return failure("Access denied", 403);
		}
		const maskError = await checkWriteMask(c, targetPath, ObjMask.NoWrite, "Cannot write to this item", true);
		if (maskError) return maskError;
		const resolved = await resolveStorage(c.env, targetPath);
		await resolved.adapter.write(resolved.path, c.req.raw);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to upload file", 400);
	}
}

export async function fsFormUpload(c: FsContext) {
	try {
		const formData = await c.req.formData();
		const file = formData.get("file");
		const path = formData.get("path") as string;
		if (!file || !(file instanceof File)) return failure("file is required", 400);
		if (!path) return failure("path is required", 400);
		const targetPath = normalizePath(path);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, targetPath);
		if (!canWrite(user, meta, targetPath)) {
			return failure("Access denied", 403);
		}
		const maskError = await checkWriteMask(c, targetPath, ObjMask.NoWrite, "Cannot write to this item", true);
		if (maskError) return maskError;
		const resolved = await resolveStorage(c.env, targetPath);
		const headers = new Headers();
		headers.set("content-type", file.type || "application/octet-stream");
		const request = new Request("https://dummy", { method: "PUT", headers, body: file.stream() });
		await resolved.adapter.write(resolved.path, request);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to upload file", 400);
	}
}

export async function fileDownload(c: FsContext) {
	try {
		// Read the wildcard by the name the route gives it; see the note in
		// `index.ts` for why a bare `*` does not work here.
		const path = `/${c.req.param("name") ?? ""}`;
		const normalizedPath = normalizePath(path);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, normalizedPath);
		if (!canAccess(user, meta, normalizedPath)) {
			return failure("Access denied", 403);
		}
		const resolved = await resolveStorage(c.env, path);
		const response = await resolved.adapter.read(resolved.path, c.req.header("Range"));
		const fileName = path.split("/").pop() ?? "file";
		const encodedFileName = encodeURIComponent(fileName).replace(
			/[!'()*]/g,
			(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
		);
		const headers = new Headers(response.headers);
		headers.set(
			"Content-Disposition",
			`attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
		);
		return new Response(response.body, { status: response.status, headers });
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to download file", 404);
	}
}

export async function fsSearch(c: FsContext) {
	try {
		const input = await body<{
			parent?: string;
			keywords?: string;
			scope?: number;
			page?: number;
			per_page?: number;
			max_depth?: number;
			max_dirs?: number;
		}>(c);
		const parent = normalizePath(input.parent ?? "/");
		const keywords = (input.keywords ?? "").toLocaleLowerCase();
		const scope = input.scope ?? 0;
		const maxDepth = Math.min(Math.max(input.max_depth ?? 5, 1), 20);
		const maxDirs = Math.min(Math.max(input.max_dirs ?? 100, 1), 1000);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const found: Array<{ parent: string; name: string; is_dir: boolean; size: number; path: string }> = [];
		const pending: Array<{ path: string; depth: number }> = [{ path: parent, depth: 0 }];
		const visited = new Set<string>();
		let dirsVisited = 0;
		let truncated = false;
		while (pending.length && dirsVisited < maxDirs) {
			const { path: current, depth } = pending.shift()!;
			if (visited.has(current)) continue;
			visited.add(current);
			if (depth > maxDepth) {
				truncated = true;
				continue;
			}
			const currentMeta = await getNearestMeta(c.env.EDGE_CONFIG, current);
			if (!canAccess(user, currentMeta, current)) continue;
			if (!(await getStorageConfig(c.env.EDGE_CONFIG, current))) {
				const virtual = await listVirtualMounts(c.env.EDGE_CONFIG, current);
				for (const item of virtual) {
					if (item.name.toLocaleLowerCase().includes(keywords) && (scope === 0 || scope === 1))
						found.push({ parent: current, name: item.name, is_dir: true, size: 0, path: item.path });
					pending.push({ path: item.path, depth: depth + 1 });
				}
				continue;
			}
			dirsVisited++;
			const resolved = await resolveStorage(c.env, current);
			const page = await resolved.adapter.list(resolved.path, { page: 1, per_page: 1000, refresh: false });
			for (const item of page.content) {
				const itemPath = normalizePath(`${current}/${item.name}`);
				const matchesName = item.name.toLocaleLowerCase().includes(keywords);
				const matchesScope = scope === 0 || (scope === 1 && item.is_dir) || (scope === 2 && !item.is_dir);
				if (matchesName && matchesScope)
					found.push({ parent: current, name: item.name, is_dir: item.is_dir, size: item.size, path: itemPath });
				if (item.is_dir) pending.push({ path: itemPath, depth: depth + 1 });
			}
		}
		if (pending.length) truncated = true;
		const pageSize = Math.max(1, input.per_page ?? 100);
		const start = Math.max(0, ((input.page ?? 1) - 1) * pageSize);
		return respond(c, { content: found.slice(start, start + pageSize), total: found.length, truncated });
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to search files", 400);
	}
}

interface DirTreeNode {
	name: string;
	path: string;
	children?: DirTreeNode[];
}

async function buildDirTree(c: FsContext, parentPath: string, depth: number, maxDepth: number): Promise<DirTreeNode[]> {
	if (depth >= maxDepth) return [];
	const auth = c.get("auth") as Record<string, unknown> | undefined;
	const user = auth ? { id: 0, permission: 3 } : null;
	const parentMeta = await getNearestMeta(c.env.EDGE_CONFIG, parentPath);
	if (!canAccess(user, parentMeta, parentPath)) return [];
	const virtualMounts = await listVirtualMounts(c.env.EDGE_CONFIG, parentPath);
	const nodes: DirTreeNode[] = [];
	for (const mount of virtualMounts) {
		const node: DirTreeNode = { name: mount.name, path: mount.path };
		const children = await buildDirTree(c, mount.path, depth + 1, maxDepth);
		if (children.length) node.children = children;
		nodes.push(node);
	}
	try {
		const resolved = await resolveStorage(c.env, parentPath);
		const result = await resolved.adapter.list(resolved.path, { page: 1, per_page: 1000, refresh: false });
		for (const item of result.content) {
			if (!item.is_dir) continue;
			const itemPath = normalizePath(`${parentPath}/${item.name}`);
			if (virtualMounts.some((m) => m.name === item.name)) continue;
			const node: DirTreeNode = { name: item.name, path: itemPath };
			const children = await buildDirTree(c, itemPath, depth + 1, maxDepth);
			if (children.length) node.children = children;
			nodes.push(node);
		}
	} catch {
		// A driver that cannot list a sub-directory still contributes the node
		// itself; the tree is best-effort by design.
	}
	return nodes;
}

export async function fsDirs(c: FsContext) {
	try {
		const input = await body<{ path?: string; depth?: number }>(c);
		const parentPath = normalizePath(input.path ?? "/");
		const depth = Math.min(Math.max(input.depth ?? 1), 10);
		const tree = await buildDirTree(c, parentPath, 0, depth);
		return respond(c, tree);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to list directories", 400);
	}
}

export async function fsRemoveEmptyDirectory(c: FsContext) {
	try {
		const input = await body<{ path: string }>(c);
		const targetPath = normalizePath(input.path);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, targetPath);
		if (!canWrite(user, meta, targetPath)) {
			return failure("Access denied", 403);
		}
		if (await isVirtualMount(c.env.EDGE_CONFIG, targetPath)) {
			return failure("Cannot remove a virtual mount point", 400);
		}
		const removed: string[] = [];
		const resolved = await resolveStorage(c.env, targetPath);
		const result = await resolved.adapter.list(resolved.path, { page: 1, per_page: 1000, refresh: false });
		for (const item of result.content) {
			if (!item.is_dir) continue;
			const childPath = normalizePath(`${targetPath}/${item.name}`);
			if (await isVirtualMount(c.env.EDGE_CONFIG, childPath)) continue;
			try {
				const childResolved = await resolveStorage(c.env, childPath);
				const childResult = await childResolved.adapter.list(childResolved.path, {
					page: 1,
					per_page: 1000,
					refresh: false,
				});
				if (childResult.content.length === 0) {
					await childResolved.adapter.remove(childResolved.path);
					removed.push(childPath);
				}
			} catch {
				// One unreadable child must not abort the sweep of its siblings.
			}
		}
		return respond(c, { removed });
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to remove empty directories", 400);
	}
}

export async function fsLink(c: FsContext) {
	try {
		const input = await body<{ path: string }>(c);
		const targetPath = normalizePath(input.path);
		const auth = c.get("auth") as Record<string, unknown> | undefined;
		const user = auth ? { id: 0, permission: 3 } : null;
		const meta = await getNearestMeta(c.env.EDGE_CONFIG, targetPath);
		if (!canAccess(user, meta, targetPath)) {
			return failure("Access denied", 403);
		}
		if (await isVirtualMount(c.env.EDGE_CONFIG, targetPath)) {
			return failure("Cannot get link for a virtual mount directory", 400);
		}
		const resolved = await resolveStorage(c.env, targetPath);
		const file = await resolved.adapter.get(resolved.path);
		if (file.is_dir) return failure("Cannot get link for a directory", 400);
		return respond(c, { url: `/d${targetPath}` });
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to get link", 400);
	}
}

// TODO: Multipart upload is a non-functional skeleton.
// Issues to resolve before production:
// 1. Session store must use KV/D1 (in-memory Map is not shared across Worker isolates).
// 2. fsMultipartChunk must read the request body and upload the binary chunk to S3.
// 3. fsMultipartComplete must call S3 CompleteMultipartUpload API.
// 4. Add session TTL/cleanup to prevent memory leaks.

export async function fsMultipartInit(_c: FsContext) {
	return failure("Multipart upload is not yet implemented", 501);
}

export async function fsMultipartChunk(_c: FsContext) {
	return failure("Multipart upload is not yet implemented", 501);
}

export async function fsMultipartComplete(_c: FsContext) {
	return failure("Multipart upload is not yet implemented", 501);
}

export async function fsMultipartStatus(_c: FsContext) {
	return failure("Multipart upload is not yet implemented", 501);
}

export async function fsMultipartAbort(_c: FsContext) {
	return failure("Multipart upload is not yet implemented", 501);
}

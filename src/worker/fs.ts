import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { planTransfers, type TransferInput, type TransferKind, type TransferPlannerDependencies } from "./fs-transfer";
import { getStorageConfig, isVirtualMount, listVirtualMounts, mergeFileObjects, paginateFileObjects } from "./storage/config";
import { resolveStorage } from "./storage/factory";
import { normalizePath, type FileObject, type StorageConfig } from "./storage/types";
import { applySort, resolveSort } from "./sort";
import { failure, respond } from "./response";

type FsContext = Context<{ Bindings: Env & EdgeListBindings }>;

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
		const input = await body<{ path?: string; page?: number; per_page?: number; refresh?: boolean; order_by?: string; order_direction?: string; extract_folder?: string }>(c);
		const requestedPath = normalizePath(input.path ?? "/");
		const virtualMounts = await listVirtualMounts(c.env.EDGE_CONFIG, requestedPath);
		let physicalItems: FileObject[] = [];
		let storage: StorageConfig | undefined;
		try {
			const resolved = await resolveStorage(c.env, input.path ?? "/");
			storage = resolved.config;
			const result = await resolved.adapter.list(resolved.path, { page: 1, per_page: 0, refresh: input.refresh ?? false });
			physicalItems = result.content.map((item) => ({ ...item, path: publicFilePath(requestedPath, item.name) }));
		} catch (error) {
			if (!virtualMounts.length) throw error;
		}
		// Sorting runs over the merged list but before pagination, so pages are
		// cut from the order the user actually sees.
		const sorted = applySort(mergeFileObjects(physicalItems, virtualMounts), resolveSort(input, storage));
		return respond(c, paginateFileObjects(sorted, input.page ?? 1, input.per_page ?? 0));
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to list path", 400); }
}

export async function fsGet(c: FsContext) {
	try {
		const input = await body<{ path?: string }>(c);
		const requestedPath = normalizePath(input.path ?? "/");
		if (await isVirtualMount(c.env.EDGE_CONFIG, requestedPath)) {
			const name = requestedPath.split("/").filter(Boolean).pop() ?? "/";
			const virtual: FileObject = { name, size: 0, is_dir: true, modified: new Date(0).toISOString(), created: new Date(0).toISOString(), path: requestedPath, mask: 0 };
			return respond(c, virtual);
		}
		const resolved = await resolveStorage(c.env, input.path ?? "/");
		return respond(c, await resolved.adapter.get(resolved.path));
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to get path", 404); }
}

export async function fsMkdir(c: FsContext) {
	try {
		const input = await body<{ path: string }>(c);
		const resolved = await resolveStorage(c.env, input.path);
		await resolved.adapter.mkdir(resolved.path);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to create directory", 400); }
}

export async function fsRename(c: FsContext) {
	try {
		const input = await body<{ path: string; name: string; overwrite?: boolean }>(c);
		const resolved = await resolveStorage(c.env, input.path);
		await resolved.adapter.rename(resolved.path, input.name, input.overwrite ?? false);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to rename path", 400); }
}

export async function fsRemove(c: FsContext) {
	try {
		const input = await body<{ dir: string; names: string[] }>(c);
		for (const name of input.names) {
			const resolved = await resolveStorage(c.env, normalizePath(`${input.dir}/${name}`));
			await resolved.adapter.remove(resolved.path);
		}
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to remove path", 400); }
}

export async function fsPut(c: FsContext) {
	try {
		const filePath = c.req.header("File-Path");
		if (!filePath) return failure("File-Path header is required", 400);
		const resolved = await resolveStorage(c.env, decodeURIComponent(filePath));
		await resolved.adapter.write(resolved.path, c.req.raw);
		return respond(c, null);
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to upload file", 400); }
}

export async function fileDownload(c: FsContext) {
	try {
		const path = `/${c.req.param("*") ?? ""}`;
		const resolved = await resolveStorage(c.env, path);
		return await resolved.adapter.read(resolved.path, c.req.header("Range"));
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to download file", 404); }
}

export async function fsSearch(c: FsContext) {
	try {
		const input = await body<{ parent?: string; keywords?: string; scope?: number; page?: number; per_page?: number }>(c);
		const parent = input.parent ?? "/";
		const keywords = (input.keywords ?? "").toLocaleLowerCase();
		const scope = input.scope ?? 0;
		const found: Array<{ parent: string; name: string; is_dir: boolean; size: number; path: string }> = [];
		const pending = [parent];
		const visited = new Set<string>();
		while (pending.length && visited.size < 1000) {
			const current = pending.shift()!;
			if (visited.has(current)) continue;
			visited.add(current);
			if (!(await getStorageConfig(c.env.EDGE_CONFIG, current))) {
				const virtual = await listVirtualMounts(c.env.EDGE_CONFIG, current);
				for (const item of virtual) {
					if (item.name.toLocaleLowerCase().includes(keywords) && (scope === 0 || scope === 1)) found.push({ parent: current, name: item.name, is_dir: true, size: 0, path: item.path });
					pending.push(item.path);
				}
				continue;
			}
			const resolved = await resolveStorage(c.env, current);
			const page = await resolved.adapter.list(resolved.path, { page: 1, per_page: 1000, refresh: false });
			for (const item of page.content) {
				const itemPath = normalizePath(`${current}/${item.name}`);
				const matchesName = item.name.toLocaleLowerCase().includes(keywords);
				const matchesScope = scope === 0 || (scope === 1 && item.is_dir) || (scope === 2 && !item.is_dir);
				if (matchesName && matchesScope) found.push({ parent: current, name: item.name, is_dir: item.is_dir, size: item.size, path: itemPath });
				if (item.is_dir) pending.push(itemPath);
			}
		}
		const pageSize = Math.max(1, input.per_page ?? 100);
		const start = Math.max(0, ((input.page ?? 1) - 1) * pageSize);
		return respond(c, { content: found.slice(start, start + pageSize), total: found.length });
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to search files", 400); }
}

import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { resolveStorage } from "./storage/factory";
import { normalizePath } from "./storage/types";
import { failure, respond } from "./response";

type FsContext = Context<{ Bindings: Env & EdgeListBindings }>;

async function body<T>(c: FsContext): Promise<T> {
	return c.req.json<T>();
}

export async function fsList(c: FsContext) {
	try {
		const input = await body<{ path?: string; page?: number; per_page?: number; refresh?: boolean }>(c);
		const resolved = await resolveStorage(c.env, input.path ?? "/");
		return respond(c, await resolved.adapter.list(resolved.path, { page: input.page ?? 1, per_page: input.per_page ?? 0, refresh: input.refresh ?? false }));
	} catch (error) { return failure(error instanceof Error ? error.message : "Unable to list path", 400); }
}

export async function fsGet(c: FsContext) {
	try {
		const input = await body<{ path?: string }>(c);
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

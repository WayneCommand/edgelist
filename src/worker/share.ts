import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { CONFIG_KEYS, readConfig } from "./env";
import { failure, respond } from "./response";
import { isShared, randomShareId, shareFailure, shareIdOf, type MetaConfig } from "./meta";
import { resolveStorage } from "./storage/factory";
import { contentTypeFor, isViewableType } from "./content-type";
import { normalizePath } from "./storage/types";

/**
 * Public shares, served without a session.
 *
 * A share *is* a metadata rule with `share: true`. There is no separate table, no
 * separate admin screen and no second source of truth: the rule already names a
 * path, and the fields it carries — code, expiry, view ceiling, remark — are the
 * share's settings. That is the whole design, and it is why "share one file" costs
 * one record rather than a schema.
 *
 * Three rules are load-bearing:
 *
 * **Off by default.** A file is public only when a rule says `share: true`.
 * `getNearestMeta` walks *up* the tree, but a share must match its own path
 * exactly — a rule on `/docs` that shares `/docs` must not publish `/docs/a.md`.
 * `nearestShare` is what enforces that.
 *
 * **A share is one path.** Directories are shareable as a *download* of the entry
 * only if they are files; a directory share lists its children through the normal
 * `fs/list` shape so the browser can walk it. Both go through the same guard.
 *
 * **The hit counter is best-effort.** It is incremented with a read-modify-write on
 * KV, which is not atomic. A burst wide enough to race loses increments; the
 * ceiling is still enforced on the value that was read, so the failure mode is a
 * share serving slightly more than its limit, never a share that cannot be
 * revoked. Making it exact would mean a Durable Object per share, which is a lot
 * of machinery for a counter.
 */

type ShareContext = Context<{ Bindings: Env & EdgeListBindings }>;

async function readMetas(kv: KVNamespace): Promise<MetaConfig[]> {
	const value = await readConfig(kv, CONFIG_KEYS.metas);
	return Array.isArray(value) ? (value as MetaConfig[]) : [];
}

async function writeMetas(kv: KVNamespace, metas: MetaConfig[]) {
	await kv.put(CONFIG_KEYS.metas, JSON.stringify(metas));
}

/**
 * The share record for an exact path.
 *
 * Not `getNearestMeta`: shares do not inherit. A rule on a directory that is
 * itself shared publishes that directory, and nothing beneath it — publishing a
 * tree is a decision the owner makes per file, or by sharing the directory and
 * letting the visitor walk it through the listing.
 */
async function exactShare(kv: KVNamespace, path: string): Promise<MetaConfig | null> {
	const normalized = normalizePath(path);
	const metas = await readMetas(kv);
	return metas.find((meta) => normalizePath(meta.path) === normalized && meta.share === true) ?? null;
}

/**
 * Whether the caller may see a share that carries a code.
 *
 * A code is a second lock, not a substitute for the session: the download page
 * asks for it once and the browser keeps it for the visit. The header is the same
 * value `fs/list` uses for directory passwords, so one input can serve both.
 */
function codeAccepted(meta: MetaConfig, supplied: string | undefined): boolean {
	const code = (meta.share_code ?? "").trim();
	if (!code) return true;
	return supplied === code;
}

function shareView(meta: MetaConfig, origin: string) {
	const id = shareIdOf(meta);
	return {
		id,
		path: meta.path,
		name: meta.path.split("/").filter(Boolean).pop() ?? meta.path,
		url: `${origin}/s/${encodeURIComponent(id)}`,
		// The address a third-party app should be given: the page is for a person,
		// this is the file. Separate paths so neither can shadow the other — a
		// browser opening `/s/<id>` has to get the page, and `curl`ing the same URL
		// has to get the file, which one route cannot decide on its own.
		raw_url: `${origin}/s/${encodeURIComponent(id)}/f`,
		remark: meta.share_remark ?? "",
		code_required: Boolean((meta.share_code ?? "").trim()),
		expires: meta.share_expires ?? "",
		views: meta.share_views ?? 0,
		max_views: meta.share_max_views ?? 0,
		enabled: meta.share_enabled !== false,
	};
}

/** `GET /api/share/list` — the shares this deployment knows about, for the admin. */
export async function shareList(c: ShareContext) {
	const metas = await readMetas(c.env.EDGE_CONFIG);
	const shares = metas.filter((meta) => meta.share === true);
	const origin = new URL(c.req.url).origin;
	return respond(c, {
		content: shares.map((meta) => ({
			...shareView(meta, origin),
			state: shareFailure(meta) ?? "work",
		})),
		total: shares.length,
	});
}

/**
 * `POST /api/share/create` — make one path public.
 *
 * Idempotent per path: sharing something already shared updates its settings
 * rather than creating a second record for the same file, because two records
 * for one path would mean two links with different rules and no way to tell
 * which one is "the" share.
 */
export async function shareCreate(c: ShareContext) {
	try {
		const input = await c.req.json<{
			path?: string;
			share_id?: string;
			share_code?: string;
			share_expires?: string;
			share_max_views?: number;
			share_remark?: string;
		}>();
		const path = normalizePath(input.path ?? "");
		if (!path || path === "/") return failure("A file path is required", 400);

		const metas = await readMetas(c.env.EDGE_CONFIG);
		const index = metas.findIndex((meta) => normalizePath(meta.path) === path);
		const existing = index === -1 ? null : metas[index];
		const id = (input.share_id ?? "").trim() || existing?.share_id || randomShareId();

		// The id addresses the share, so it has to be unique across shares — two
		// shares with one id would make `/s/<id>` ambiguous.
		const clash = metas.some(
			(meta) => meta.share === true && normalizePath(meta.path) !== path && shareIdOf(meta) === id,
		);
		if (clash) return failure("That share id is already in use", 409);

		const record: MetaConfig = {
			...(existing ?? { id: Math.max(0, ...metas.map((meta) => meta.id || 0)) + 1 }),
			path,
			share: true,
			share_id: id,
			share_code: (input.share_code ?? existing?.share_code ?? "").trim(),
			share_expires: (input.share_expires ?? existing?.share_expires ?? "").trim(),
			share_max_views: Math.max(0, Number(input.share_max_views ?? existing?.share_max_views ?? 0) || 0),
			share_remark: input.share_remark ?? existing?.share_remark ?? "",
			// A re-share keeps its history; a new one starts at zero.
			share_views: existing?.share_views ?? 0,
			share_enabled: existing?.share_enabled ?? true,
		};
		if (index === -1) metas.push(record);
		else metas[index] = record;
		await writeMetas(c.env.EDGE_CONFIG, metas);
		return respond(c, shareView(record, new URL(c.req.url).origin));
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to create the share", 400);
	}
}

/** `POST /api/share/update` — change a share's settings. */
export async function shareUpdate(c: ShareContext) {
	try {
		const input = await c.req.json<Partial<MetaConfig> & { path?: string }>();
		const path = normalizePath(input.path ?? "");
		if (!path) return failure("A file path is required", 400);
		const metas = await readMetas(c.env.EDGE_CONFIG);
		const index = metas.findIndex((meta) => normalizePath(meta.path) === path && meta.share === true);
		if (index === -1) return failure("Share not found", 404);
		// Only the share fields are writable here. Letting this endpoint accept a
		// whole rule would make it a second, unaudited path into `write: false` and
		// `hide`, which is the metadata screen's job.
		const current = metas[index];
		const next: MetaConfig = {
			...current,
			share_enabled: input.share_enabled ?? current.share_enabled,
			share_code: (input.share_code ?? current.share_code ?? "").trim(),
			share_expires: (input.share_expires ?? current.share_expires ?? "").trim(),
			share_max_views:
				input.share_max_views === undefined
					? (current.share_max_views ?? 0)
					: Math.max(0, Number(input.share_max_views) || 0),
			share_remark: input.share_remark ?? current.share_remark ?? "",
		};
		metas[index] = next;
		await writeMetas(c.env.EDGE_CONFIG, metas);
		return respond(c, shareView(next, new URL(c.req.url).origin));
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to update the share", 400);
	}
}

/**
 * `POST /api/share/delete` — make a path private again.
 *
 * The metadata rule is kept when it has other work to do — a password, a readme,
 * a hide pattern — and only loses `share`. A rule that existed *only* to be a
 * share is removed, because leaving an empty record behind would clutter the
 * metadata screen with rows that do nothing.
 */
export async function shareDelete(c: ShareContext) {
	try {
		const input = await c.req.json<{ path?: string }>();
		const path = normalizePath(input.path ?? "");
		if (!path) return failure("A file path is required", 400);
		const metas = await readMetas(c.env.EDGE_CONFIG);
		const index = metas.findIndex((meta) => normalizePath(meta.path) === path && meta.share === true);
		if (index === -1) return failure("Share not found", 404);
		const {
			share,
			share_id,
			share_views,
			share_max_views,
			share_expires,
			share_enabled,
			share_code,
			share_remark,
			...rest
		} = metas[index];
		void share;
		void share_id;
		void share_views;
		void share_max_views;
		void share_expires;
		void share_enabled;
		void share_code;
		void share_remark;
		const meaningful = Object.entries(rest).some(
			([key, value]) =>
				!["id", "path"].includes(key) && value !== undefined && value !== "" && value !== null && value !== false,
		);
		if (meaningful) metas[index] = rest as MetaConfig;
		else metas.splice(index, 1);
		await writeMetas(c.env.EDGE_CONFIG, metas);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to delete the share", 400);
	}
}

/**
 * Resolves a public request, counting the hit.
 *
 * Shared by the metadata lookup and the download route so neither can be the one
 * that forgets to enforce the ceiling. The counter is written back only when the
 * request is allowed to proceed — a refused request must not consume an allowed
 * view, or a link behind a code would burn its quota on wrong guesses.
 */
async function openShare(c: ShareContext, id: string, code: string | undefined, count = true) {
	const target = decodeURIComponent(id ?? "").trim();
	if (!target) return { error: "not_shared" as const, meta: null };

	const metas = await readMetas(c.env.EDGE_CONFIG);
	const meta = metas.find((entry) => entry.share === true && shareIdOf(entry) === target) ?? null;
	const reason = shareFailure(meta);
	if (reason) return { error: reason, meta: null };
	if (!meta) return { error: "not_shared" as const, meta: null };
	if (!codeAccepted(meta, code)) return { error: "code_required" as const, meta };

	// A page view is not a download. Counting it would mean a visitor who opens
	// the link and then clicks Download spends two of a "maximum downloads" of
	// two — the label promises downloads, so only those are counted.
	if (!count) return { error: null, meta };

	// Write the hit back. A failure here must not fail the download: the file is
	// public, and a KV write that timed out is not a reason to withhold it.
	const views = (meta.share_views ?? 0) + 1;
	const counted = { ...meta, share_views: views };
	try {
		const index = metas.findIndex((entry) => normalizePath(entry.path) === normalizePath(meta.path));
		if (index !== -1) {
			metas[index] = { ...metas[index], share_views: views };
			await writeMetas(c.env.EDGE_CONFIG, metas);
		}
	} catch {
		/* the view was served; the count is best-effort */
	}
	// The caller gets the record as it now stands. Returning the pre-increment
	// copy made every page report its own visit as "not counted yet", so the
	// number in the dialog disagreed with the number in the table.
	return { error: null, meta: counted };
}

const SHARE_MESSAGES: Record<string, { message: string; status: number }> = {
	not_shared: { message: "This share has expired or been cancelled", status: 404 },
	disabled: { message: "This share has been disabled", status: 404 },
	expired: { message: "This share has expired", status: 410 },
	exhausted: { message: "This share has reached its access limit", status: 410 },
	code_required: { message: "Please enter Share Code", status: 401 },
};

/** `GET /api/s/:id` — what a public visitor is allowed to know. */
export async function shareGet(c: ShareContext) {
	const id = c.req.param("id") ?? "";
	const opened = await openShare(c, id, c.req.header("X-Share-Code") ?? c.req.query("code"), false);
	if (opened.error) {
		const known = SHARE_MESSAGES[opened.error] ?? { message: "Share not found", status: 404 };
		return failure(known.message, known.status);
	}
	const meta = opened.meta!;
	const origin = new URL(c.req.url).origin;
	// The visitor's page shows a size, so the object is looked up once. A share
	// that cannot be read is still a valid share record — the page just omits the
	// size rather than failing to render.
	let size = 0;
	let isDir = false;
	try {
		const resolved = await resolveStorage(c.env, meta.path);
		const object = await resolved.adapter.get(resolved.path);
		size = object.size ?? 0;
		isDir = object.is_dir;
	} catch {
		/* the page still renders; the download will report its own error */
	}
	return respond(c, {
		...shareView(meta, origin),
		header: meta.header ?? "",
		readme: meta.readme ?? "",
		size,
		is_dir: isDir,
	});
}

/**
 * `GET /s/:id` — the public download, and the direct link.
 *
 * A third-party app should be able to take the *original* file from this URL, so
 * three things matter beyond serving the bytes:
 *
 * **Range is forwarded.** A media player seeks, a download manager resumes, and a
 * `PDF` viewer requests a window of the file. The adapter passes the header
 * upstream and the `206` comes back with `Content-Range` intact.
 *
 * **The type is the file's.** Object stores often answer
 * `application/octet-stream` for everything, which makes a `.png` link download
 * instead of display. The extension is consulted when the store is silent, and a
 * type the store *did* record is left alone.
 *
 * **CORS is open.** A link is meant to be embedded — an `<img>`, a `<video>`, a
 * `fetch` from another origin. Without `Access-Control-Allow-Origin` those fail
 * even though the file is public, because the browser enforces the policy on the
 * page's origin, not the server's intent. `*` is right here and only here: the
 * route serves one file whose owner explicitly published it, carries no cookies,
 * no credentials and no other user's data, and the code is a query parameter
 * rather than a session.
 */
export async function shareDownload(c: ShareContext) {
	const id = c.req.param("id") ?? "";
	const origin = c.req.header("Origin");
	const cors = corsHeaders(origin);
	if (c.req.method === "OPTIONS") {
		// A preflight from an embedding page: answer it without opening the share,
		// so an aborted preflight cannot spend a view.
		return new Response(null, { status: 204, headers: cors });
	}
	// A `HEAD` is a client asking whether the link works and how big the file is —
	// a link checker, a player probing before it plays. It carries no body, so it
	// is not a download and must not consume one.
	const opened = await openShare(c, id, c.req.header("X-Share-Code") ?? c.req.query("code"), c.req.method !== "HEAD");
	if (opened.error) {
		const known = SHARE_MESSAGES[opened.error] ?? { message: "Share not found", status: 404 };
		const denied = failure(known.message, known.status);
		for (const [key, value] of Object.entries(cors)) denied.headers.set(key, value);
		return denied;
	}
	const meta = opened.meta!;
	try {
		const resolved = await resolveStorage(c.env, meta.path);
		const object = await resolved.adapter.get(resolved.path);
		if (object.is_dir) return failure("Cannot download a directory", 400);
		const response = await resolved.adapter.read(resolved.path, c.req.header("Range"));
		const fileName = meta.path.split("/").pop() ?? "file";
		const encoded = encodeURIComponent(fileName).replace(
			/[!'()*]/g,
			(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
		);
		const headers = new Headers(response.headers);
		for (const [key, value] of Object.entries(cors)) headers.set(key, value);

		// The store's own type wins when it has one; a generic type is replaced by
		// what the extension implies, so an image stays an image. This is decided
		// from the *name*, before the read, so a link's headers do not depend on
		// whether the storage happened to answer.
		const upstreamType = headers.get("content-type") ?? "";
		const type = !upstreamType || upstreamType === "application/octet-stream" ? contentTypeFor(fileName) : upstreamType;
		headers.set("content-type", type);

		// `inline` for what a browser can show, `attachment` for everything else.
		// The bytes do not change; only whether the link opens or saves.
		headers.set(
			"Content-Disposition",
			`${isViewableType(type) ? "inline" : "attachment"}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
		);
		// Range needs to be advertised, or a client does not know it may ask.
		headers.set("Accept-Ranges", "bytes");
		// A share is public, so it must not be cached by an intermediary past the
		// point the owner revokes it.
		headers.set("Cache-Control", "no-store");
		return new Response(c.req.method === "HEAD" ? null : response.body, { status: response.status, headers });
	} catch (error) {
		const failed = failure(error instanceof Error ? error.message : "Unable to download the file", 404);
		for (const [key, value] of Object.entries(cors)) failed.headers.set(key, value);
		return failed;
	}
}

/**
 * The CORS headers a public link answers with.
 *
 * `*` rather than the request's origin: a share has no session to protect and no
 * per-origin policy to enforce, and reflecting the origin would only make caching
 * and `curl` more complicated for no gain. `expose-headers` is what lets a
 * JavaScript client read the size and the range back — without it `fetch` sees
 * them as opaque and a resuming downloader has nothing to resume from.
 */
function corsHeaders(origin: string | undefined): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
		"Access-Control-Allow-Headers": "Range, X-Share-Code, If-None-Match, If-Modified-Since",
		"Access-Control-Expose-Headers":
			"Content-Length, Content-Range, Content-Type, Content-Disposition, Accept-Ranges, ETag, Last-Modified",
		// A private-network call from a public page would still be blocked, which is
		// the one place an explicit hint helps.
		"Access-Control-Max-Age": origin ? "86400" : "0",
	};
}

/**
 * The share state of one path, for the browser and the file page.
 *
 * Reads the exact record rather than walking up, so a file under a shared folder
 * correctly reports "not shared".
 */
export async function shareState(c: ShareContext) {
	const input = await c.req.json<{ path?: string }>();
	const path = normalizePath(input.path ?? "");
	const meta = await exactShare(c.env.EDGE_CONFIG, path);
	const origin = new URL(c.req.url).origin;
	if (!meta) return respond(c, { shared: false, share: null });
	return respond(c, {
		shared: isShared(meta),
		state: shareFailure(meta) ?? "work",
		share: shareView(meta, origin),
	});
}

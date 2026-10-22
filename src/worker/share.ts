import type { Context } from "hono";
import type { EdgeListBindings } from "./env";
import { CONFIG_KEYS, readConfig } from "./env";
import { failure, respond } from "./response";
import { getNearestMeta, metaHeader, metaReadme } from "./meta";
import { resolveStorage } from "./storage/factory";
import { listStorageConfigs } from "./storage/config";
import { contentTypeFor, isViewableType } from "./content-type";
import { normalizePath, type StorageConfig } from "./storage/types";

/**
 * Public shares, served without a session.
 *
 * A share is its own record, not a metadata rule. The two answer different
 * questions — a metadata rule governs how a path behaves for signed-in users
 * (password, readme, hide patterns), while a share says that one path may be
 * fetched by anyone — and keeping them apart means deleting a share cannot
 * delete a readme, and a metadata import cannot silently publish a file.
 *
 * The address *is* the path. `/waynecos/token.md` is the page and
 * `/waynecos/token.md/download` is the file, so a link reads as the file it
 * points at instead of an opaque token that has to be looked up. That also
 * makes the share storage row meaningful: the owner knows which mount serves
 * the bytes, and does not have to guess what a random id refers to.
 *
 * Three rules are load-bearing:
 *
 * **Off by default.** A path is public only when a share record names it
 * exactly. There is no inheritance, so sharing `/docs` never publishes
 * `/docs/a.md`.
 *
 * **The count is best-effort.** It is a read-modify-write on KV, which is not
 * atomic. A burst wide enough to race loses increments; the ceiling is still
 * enforced on the value that was read, so the failure mode is a share serving
 * slightly more than its limit, never a share that cannot be revoked.
 *
 * **A share names its storage.** The mount is resolved when the share is
 * created and recorded on the record. Reads prefer the storage's current name
 * so renaming a mount updates the screen without rewriting every share.
 */

export interface ShareRecord {
	/** The virtual path, which is also the public address. */
	path: string;
	/** The storage that served this path when the share was created. */
	storage_id: number;
	storage_name: string;
	storage_mount: string;
	created_at?: string;
	/** An optional code a visitor must supply before the file is served. */
	code?: string;
	/** ISO timestamp, or empty for no expiry. */
	expires?: string;
	/** The ceiling (0 = unlimited) and the hits so far. */
	max_views?: number;
	views?: number;
	/** `false` disables without deleting. */
	enabled?: boolean;
	/** Shown on the share page by the client. */
	remark?: string;
}

export type ShareFailure = "not_shared" | "disabled" | "expired" | "exhausted";

type ShareContext = Context<{ Bindings: Env & EdgeListBindings }>;

async function readShares(kv: KVNamespace): Promise<ShareRecord[]> {
	const value = await readConfig(kv, CONFIG_KEYS.shares);
	if (!Array.isArray(value)) return [];
	return (value as ShareRecord[]).filter((item) => item && typeof item === "object" && typeof item.path === "string");
}

async function writeShares(kv: KVNamespace, shares: ShareRecord[]) {
	await kv.put(CONFIG_KEYS.shares, JSON.stringify(shares));
}

/**
 * Why a share cannot be served, or `null` when it can.
 *
 * The reasons are separate rather than one boolean because the browser has to
 * say *which* thing is wrong: "expired" is not the same message as "used up",
 * and a disabled share is not a missing one. The order matters — an expired
 * share has also usually been used at least once, and reporting "disabled" for
 * something the owner simply let lapse would be the wrong sentence.
 */
export function shareFailure(share: ShareRecord | null, now = Date.now()): ShareFailure | null {
	if (!share) return "not_shared";
	// `false` is the only value that disables: an absent flag is a share that was
	// never switched off.
	if (share.enabled === false) return "disabled";
	if (share.expires) {
		const expiry = Date.parse(share.expires);
		// An unparsable date is treated as no expiry rather than as an immediate
		// one: a typo in a share's settings should not make the owner think the
		// link broke on its own.
		if (Number.isFinite(expiry) && expiry <= now) return "expired";
	}
	const maximum = share.max_views ?? 0;
	if (maximum > 0 && (share.views ?? 0) >= maximum) return "exhausted";
	return null;
}

/**
 * The path as URL segments: `/waynecos/token.md` → `waynecos/token.md`.
 *
 * Each segment is encoded on its own so the slashes stay slashes — the path is
 * the address, and encoding the whole thing would turn the mount into a single
 * opaque segment that no route could read back.
 */
export function encodedSharePath(path: string): string {
	return normalizePath(path)
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

/**
 * The storage a share is served from, preferring the live configuration.
 *
 * A record keeps the name it was created with so a deleted storage still has a
 * label on the screen; when the storage still exists its current remark and
 * mount win, because that is what the owner sees on the storage page today.
 */
function storageView(share: ShareRecord, config?: StorageConfig) {
	const mount = normalizePath(config?.mount_path ?? share.storage_mount ?? "/");
	const name = (config?.remark ?? share.storage_name ?? "").trim() || mount;
	return { id: config?.id ?? share.storage_id ?? 0, name, mount_path: mount };
}

function shareView(share: ShareRecord, origin: string, config?: StorageConfig) {
	const encoded = encodedSharePath(share.path);
	return {
		path: share.path,
		name: share.path.split("/").filter(Boolean).pop() ?? share.path,
		// The page is for a person; the download is the link a third-party app or
		// a browser's address bar should be given. Both are derived from the path,
		// so the same file always has the same two addresses.
		url: `${origin}/s/${encoded}`,
		raw_url: `${origin}/s/${encoded}/download`,
		storage: storageView(share, config),
		remark: share.remark ?? "",
		code_required: Boolean((share.code ?? "").trim()),
		expires: share.expires ?? "",
		views: share.views ?? 0,
		max_views: share.max_views ?? 0,
		enabled: share.enabled !== false,
	};
}

/**
 * Whether the caller may see a share that carries a code.
 *
 * A code is a second lock, not a substitute for the session: the download page
 * asks for it once and the browser keeps it for the visit. The header is the same
 * value `fs/list` uses for directory passwords, so one input can serve both.
 */
function codeAccepted(share: ShareRecord, supplied: string | undefined): boolean {
	const code = (share.code ?? "").trim();
	if (!code) return true;
	return supplied === code;
}

/** `GET /api/share/list` — the shares this deployment knows about, for the admin. */
export async function shareList(c: ShareContext) {
	const [shares, storages] = await Promise.all([readShares(c.env.EDGE_CONFIG), listStorageConfigs(c.env.EDGE_CONFIG)]);
	const byId = new Map(storages.map((storage) => [storage.id, storage]));
	const origin = new URL(c.req.url).origin;
	return respond(c, {
		content: shares.map((share) => ({
			...shareView(share, origin, byId.get(share.storage_id)),
			state: shareFailure(share) ?? "work",
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
			code?: string;
			expires?: string;
			max_views?: number;
			remark?: string;
		}>();
		const path = normalizePath(input.path ?? "");
		if (!path || path === "/") return failure("A file path is required", 400);

		// The storage is part of what is being shared, so it is resolved before a
		// record exists: a path no mount serves cannot be published, and the
		// record then names the mount that will serve every later request.
		let storage: StorageConfig;
		let resolvedMount: string;
		try {
			const resolved = await resolveStorage(c.env, path);
			storage = resolved.config;
			resolvedMount = normalizePath(resolved.config.mount_path);
		} catch (error) {
			return failure(error instanceof Error ? error.message : "Storage not found", 404);
		}

		const shares = await readShares(c.env.EDGE_CONFIG);
		const index = shares.findIndex((share) => normalizePath(share.path) === path);
		const existing = index === -1 ? null : shares[index];
		const record: ShareRecord = {
			path,
			storage_id: storage.id,
			storage_name: (storage.remark ?? "").trim() || resolvedMount,
			storage_mount: resolvedMount,
			created_at: existing?.created_at ?? new Date().toISOString(),
			code: (input.code ?? existing?.code ?? "").trim(),
			expires: (input.expires ?? existing?.expires ?? "").trim(),
			max_views: Math.max(0, Number(input.max_views ?? existing?.max_views ?? 0) || 0),
			remark: input.remark ?? existing?.remark ?? "",
			// A re-share keeps its history; a new one starts at zero.
			views: existing?.views ?? 0,
			enabled: existing?.enabled ?? true,
		};
		if (index === -1) shares.push(record);
		else shares[index] = record;
		await writeShares(c.env.EDGE_CONFIG, shares);
		return respond(c, shareView(record, new URL(c.req.url).origin, storage));
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to create the share", 400);
	}
}

/** `POST /api/share/update` — change a share's settings. */
export async function shareUpdate(c: ShareContext) {
	try {
		const input = await c.req.json<{
			path?: string;
			enabled?: boolean;
			code?: string;
			expires?: string;
			max_views?: number;
			remark?: string;
		}>();
		const path = normalizePath(input.path ?? "");
		if (!path) return failure("A file path is required", 400);
		const shares = await readShares(c.env.EDGE_CONFIG);
		const index = shares.findIndex((share) => normalizePath(share.path) === path);
		if (index === -1) return failure("Share not found", 404);
		// Only the share fields are writable here. Letting this endpoint accept a
		// whole metadata rule would make it a second, unaudited path into
		// `write: false` and `hide`, which is the metadata screen's job.
		const current = shares[index];
		const next: ShareRecord = {
			...current,
			enabled: input.enabled ?? current.enabled,
			code: input.code === undefined ? (current.code ?? "") : input.code.trim(),
			expires: (input.expires ?? current.expires ?? "").trim(),
			max_views: input.max_views === undefined ? (current.max_views ?? 0) : Math.max(0, Number(input.max_views) || 0),
			remark: input.remark ?? current.remark ?? "",
		};
		shares[index] = next;
		await writeShares(c.env.EDGE_CONFIG, shares);
		return respond(c, shareView(next, new URL(c.req.url).origin));
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to update the share", 400);
	}
}

/** `POST /api/share/delete` — make a path private again. */
export async function shareDelete(c: ShareContext) {
	try {
		const input = await c.req.json<{ path?: string }>();
		const path = normalizePath(input.path ?? "");
		if (!path) return failure("A file path is required", 400);
		const shares = await readShares(c.env.EDGE_CONFIG);
		const index = shares.findIndex((share) => normalizePath(share.path) === path);
		if (index === -1) return failure("Share not found", 404);
		shares.splice(index, 1);
		await writeShares(c.env.EDGE_CONFIG, shares);
		return respond(c, null);
	} catch (error) {
		return failure(error instanceof Error ? error.message : "Unable to delete the share", 400);
	}
}

/**
 * Resolves a public request, counting the hit.
 *
 * Shared by the page lookup and the download route so neither can be the one
 * that forgets to enforce the ceiling. The counter is written back only when the
 * request is allowed to proceed — a refused request must not consume an allowed
 * view, or a link behind a code would burn its quota on wrong guesses.
 */
async function openShare(c: ShareContext, path: string, code: string | undefined, count = true) {
	const target = normalizePath(path);
	if (!target || target === "/") return { error: "not_shared" as const, share: null };

	const shares = await readShares(c.env.EDGE_CONFIG);
	const index = shares.findIndex((entry) => normalizePath(entry.path) === target);
	const share = index === -1 ? null : shares[index];
	if (!share) return { error: "not_shared" as const, share: null };
	const reason = shareFailure(share);
	if (reason) return { error: reason, share: null };
	if (!codeAccepted(share, code)) return { error: "code_required" as const, share };

	// A page view is not a download. Counting it would mean a visitor who opens
	// the link and then clicks Download spends two of a "maximum downloads" of
	// two — the label promises downloads, so only those are counted.
	if (!count) return { error: null, share };

	// Write the hit back. A failure here must not fail the download: the file is
	// public, and a KV write that timed out is not a reason to withhold it.
	const views = (share.views ?? 0) + 1;
	try {
		shares[index] = { ...share, views };
		await writeShares(c.env.EDGE_CONFIG, shares);
	} catch {
		/* the view was served; the count is best-effort */
	}
	// The caller gets the record as it now stands. Returning the pre-increment
	// copy made every page report its own visit as "not counted yet", so the
	// number in the dialog disagreed with the number in the table.
	return { error: null, share: { ...share, views } };
}

const SHARE_MESSAGES: Record<string, { message: string; status: number }> = {
	not_shared: { message: "This share has expired or been cancelled", status: 404 },
	disabled: { message: "This share has been disabled", status: 404 },
	expired: { message: "This share has expired", status: 410 },
	exhausted: { message: "This share has reached its access limit", status: 410 },
	code_required: { message: "Please enter Share Code", status: 401 },
};

/** `GET /api/s/:path` — what a public visitor is allowed to know. */
export async function shareGet(c: ShareContext) {
	const opened = await openShare(
		c,
		c.req.param("path") ?? "",
		c.req.header("X-Share-Code") ?? c.req.query("code"),
		false,
	);
	if (opened.error) {
		const known = SHARE_MESSAGES[opened.error] ?? { message: "Share not found", status: 404 };
		return failure(known.message, known.status);
	}
	const share = opened.share!;
	const origin = new URL(c.req.url).origin;
	// Readme and header are still metadata's job: a share publishes a path, and
	// the rule on that path may still carry the owner's note about it.
	const meta = await getNearestMeta(c.env.EDGE_CONFIG, share.path);
	// The visitor's page shows a size, so the object is looked up once. A share
	// that cannot be read is still a valid share record — the page just omits the
	// size rather than failing to render.
	let size = 0;
	let isDir = false;
	try {
		const resolved = await resolveStorage(c.env, share.path);
		const object = await resolved.adapter.get(resolved.path);
		size = object.size ?? 0;
		isDir = object.is_dir;
	} catch {
		/* the page still renders; the download will report its own error */
	}
	return respond(c, {
		...shareView(share, origin),
		header: metaHeader(meta, share.path),
		readme: metaReadme(meta, share.path),
		size,
		is_dir: isDir,
	});
}

/**
 * `GET /s/:path/download` — the public file, and the direct link.
 *
 * A third-party app should be able to take the *original* file from this URL, so
 * three things matter beyond serving the bytes:
 *
 * **Range is forwarded.** A media player seeks, a download manager resumes, and
 * a `PDF` viewer requests a window of the file. The adapter passes the header
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
	const path = c.req.param("path") ?? "";
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
	const opened = await openShare(c, path, c.req.header("X-Share-Code") ?? c.req.query("code"), c.req.method !== "HEAD");
	if (opened.error) {
		const known = SHARE_MESSAGES[opened.error] ?? { message: "Share not found", status: 404 };
		const denied = failure(known.message, known.status);
		for (const [key, value] of Object.entries(cors)) denied.headers.set(key, value);
		return denied;
	}
	const share = opened.share!;
	try {
		const resolved = await resolveStorage(c.env, share.path);
		const object = await resolved.adapter.get(resolved.path);
		if (object.is_dir) return failure("Cannot download a directory", 400);
		const response = await resolved.adapter.read(resolved.path, c.req.header("Range"));
		const fileName = share.path.split("/").pop() ?? "file";
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
	const shares = await readShares(c.env.EDGE_CONFIG);
	const share = shares.find((entry) => normalizePath(entry.path) === path) ?? null;
	const origin = new URL(c.req.url).origin;
	if (!share) return respond(c, { shared: false, share: null });
	const storages = await listStorageConfigs(c.env.EDGE_CONFIG);
	return respond(c, {
		shared: shareFailure(share) === null,
		state: shareFailure(share) ?? "work",
		share: shareView(
			share,
			origin,
			storages.find((storage) => storage.id === share.storage_id),
		),
	});
}

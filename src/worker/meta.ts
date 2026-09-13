import { CONFIG_KEYS, readConfig } from "./env";
import { normalizePath } from "./storage/types";

export interface MetaConfig {
	id: number;
	path: string;
	read_users?: number[];
	read_users_sub?: boolean;
	write_users?: number[];
	write_users_sub?: boolean;
	password?: string;
	p_sub?: boolean;
	write?: boolean;
	w_sub?: boolean;
	hide?: string;
	h_sub?: boolean;
	readme?: string;
	r_sub?: boolean;
	header?: string;
	header_sub?: boolean;
	[key: string]: unknown;
}

function metaCoversPath(metaPath: string, reqPath: string, applyToSubFolder: boolean): boolean {
	const normalizedMeta = normalizePath(metaPath);
	const normalizedReq = normalizePath(reqPath);
	if (normalizedMeta === normalizedReq) return true;
	// The separator is added to the rule's own path, so the root rule's prefix is
	// "/" rather than "//" — otherwise a rule on "/" with any `_sub` flag covers
	// nothing at all, and its hide patterns, password and read/write lists
	// silently stop applying to the paths they were meant to govern. OpenList
	// gets this from `PathAddSeparatorSuffix`, which leaves "/" alone.
	const prefix = normalizedMeta === "/" ? "/" : `${normalizedMeta}/`;
	return applyToSubFolder && normalizedReq.startsWith(prefix);
}

function pathDir(path: string): string {
	const normalized = normalizePath(path);
	if (normalized === "/") return "/";
	const parts = normalized.split("/").filter(Boolean);
	parts.pop();
	return `/${parts.join("/")}`;
}

export async function getNearestMeta(kv: KVNamespace, path: string): Promise<MetaConfig | null> {
	const normalized = normalizePath(path);
	// The canonical key, not the bare word: the admin endpoints and the backup
	// layer both store metas under `CONFIG_KEYS.metas`, so reading anything else
	// silently returns null and makes every rule in the app inert.
	const metas = (await readConfig(kv, CONFIG_KEYS.metas)) as MetaConfig[];
	if (!Array.isArray(metas)) return null;
	const exact = metas.find((meta) => normalizePath(meta.path) === normalized);
	if (exact) return exact;
	if (normalized === "/") return null;
	return getNearestMeta(kv, pathDir(normalized));
}

export function canRead(user: { id?: number } | null, meta: MetaConfig | null, path: string): boolean {
	if (!user || !meta) return true;
	if (
		meta.read_users &&
		meta.read_users.length > 0 &&
		user.id !== undefined &&
		!meta.read_users.includes(user.id) &&
		metaCoversPath(meta.path, path, meta.read_users_sub ?? false)
	) {
		return false;
	}
	return true;
}

export function canWrite(
	user: { id?: number; permission?: number } | null,
	meta: MetaConfig | null,
	path: string,
): boolean {
	if (!user || !meta) return true;
	if (meta.write === false && metaCoversPath(meta.path, path, meta.w_sub ?? false)) {
		return false;
	}
	if (
		meta.write_users &&
		meta.write_users.length > 0 &&
		user.id !== undefined &&
		!meta.write_users.includes(user.id) &&
		metaCoversPath(meta.path, path, meta.write_users_sub ?? false)
	) {
		return false;
	}
	return true;
}

/**
 * Whether the user is exempt from `hide` rules.
 *
 * OpenList spends a whole permission bit on this (`model.CanSeeHides`, bit 0)
 * rather than deriving it from an "admin" label, and every hide check consults
 * it *before* matching patterns. So a user who can see hides is never blocked by
 * one — see `common.CanAccess` and `fs.whetherHide` in the reference.
 */
export function canSeeHides(user: { permission?: number } | null): boolean {
	return ((user?.permission ?? 0) & 1) !== 0;
}

/**
 * Whether a listing should drop the entries a rule's hide patterns match.
 *
 * This is deliberately a *separate* check from `canAccess`, because OpenList
 * resolves it in `fs.whetherHide` and it asks a different question: it looks at
 * the directory being listed rather than at the parent of the requested path.
 * `h_sub` is the subfolder flag here too — a rule on `/docs` with `h_sub` off
 * still hides the entries sitting directly inside `/docs`, because that is an
 * exact match; it just stops reaching into `/docs/deep`.
 */
export function whetherHide(user: { permission?: number } | null, meta: MetaConfig | null, path: string): boolean {
	if (!user || canSeeHides(user)) return false;
	if (!meta || !meta.hide) return false;
	return metaCoversPath(meta.path, path, meta.h_sub ?? false);
}

export function canAccess(
	user: { id?: number; permission?: number } | null,
	meta: MetaConfig | null,
	reqPath: string,
	password?: string,
): boolean {
	if (!user || !meta) return true;
	// `h_sub` is the subfolder flag, not a switch that turns the rule on: an
	// exact match on the parent directory always applies. Passing it as the flag
	// (rather than requiring it to be true) is what `common.CanAccess` does, and
	// it is why a rule saved from the metadata form — which used to have no
	// `h_sub` control at all — was inert.
	if (meta.hide && !canSeeHides(user) && metaCoversPath(meta.path, pathDir(reqPath), meta.h_sub ?? false)) {
		const patterns = meta.hide.split("\n").filter(Boolean);
		const fileName = reqPath.split("/").pop() ?? "";
		for (const pattern of patterns) {
			try {
				if (new RegExp(pattern).test(fileName)) return false;
			} catch {
				/* invalid regex pattern, skip */
			}
		}
	}
	if (!canRead(user, meta, reqPath)) return false;
	if (user.permission !== undefined && (user.permission & 2) !== 0) return true;
	if (!meta.password) return true;
	if (!metaCoversPath(meta.path, reqPath, meta.p_sub ?? false)) return true;
	return meta.password === password;
}

/**
 * The readme and header a directory inherits from its nearest meta rule.
 *
 * Each field is paired with its own `_sub` flag rather than sharing one, which is
 * how OpenList resolves them: a rule on `/docs` can put a readme on `/docs` alone
 * (`r_sub` false) while its header applies to everything underneath
 * (`header_sub` true). The value is whatever the rule holds — markdown text, or a
 * URL the client fetches — so the worker only decides *whether* it applies.
 */
export function metaReadme(meta: MetaConfig | null, path: string): string {
	if (meta && metaCoversPath(meta.path, path, meta.r_sub ?? false)) return meta.readme ?? "";
	return "";
}

export function metaHeader(meta: MetaConfig | null, path: string): string {
	if (meta && metaCoversPath(meta.path, path, meta.header_sub ?? false)) return meta.header ?? "";
	return "";
}

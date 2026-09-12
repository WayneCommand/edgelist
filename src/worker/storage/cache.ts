import { findDriver } from "./registry";
import {
	CACHE_EXPIRATION_DEFAULT_MINUTES,
	normalizePath,
	type FileObject,
	type StorageAdapter,
	type StorageConfig,
} from "./types";

/**
 * The directory listing cache.
 *
 * Browsing a directory is the one thing a file manager does constantly, and
 * every listing is an upstream round trip. OpenList keeps a per-mount
 * directory cache for exactly that reason (`internal/op/cache.go`), keyed by
 * `GetFullPath(mount_path, path)`, with a per-storage TTL and per-path
 * overrides, and it lets a client ask for `refresh` to read past it. This
 * module is that behaviour on Cloudflare's edge cache.
 *
 * Two differences from the in-process cache OpenList uses are worth stating
 * plainly:
 *
 * - `caches.default` is per-datacentre and cannot be enumerated, so a write
 *   invalidates the directories it names, in the datacentre that served it.
 *   Other datacentres, and paths *below* a removed directory, keep serving
 *   their entry until the TTL expires. The TTL is therefore the real bound on
 *   staleness, not the invalidation.
 * - The cache is keyed by the virtual path, which is what OpenList's key
 *   reduces to: `GetFullPath(mount, relative)` is just the path the client
 *   asked for. One key therefore covers both halves.
 */

/**
 * A synthetic origin for cache keys. It is never resolved — the Cache API is a
 * key/value store — so it only has to be a stable, valid URL.
 */
export const CACHE_ORIGIN = "https://edgelist-cache.invalid";

/** The part of Cloudflare's Cache API this module uses. */
export interface DirectoryCache {
	match(request: Request): Promise<Response | undefined>;
	put(request: Request, response: Response): Promise<void>;
	delete(request: Request): Promise<boolean>;
}

/** The edge cache, or `null` where there is none — Node under vitest, mostly. */
export function edgeCache(): DirectoryCache | null {
	const globals = globalThis as { caches?: { default?: DirectoryCache } };
	return globals.caches?.default ?? null;
}

/**
 * The key for one directory. OpenList's `Key(storage, path)` is
 * `GetFullPath(mount_path, path)` (`internal/op/cache.go:36`), and joining the
 * mount to the storage-relative path yields the virtual path — so the virtual
 * path is the whole key.
 *
 * The path is percent-encoded rather than interpolated: a directory name may
 * legitimately contain `?`, `#` or a space, and an unencoded one would be
 * parsed as a query or a fragment and collide with a different directory.
 */
export function directoryCacheKey(virtualPath: string): Request {
	return new Request(`${CACHE_ORIGIN}/directory?path=${encodeURIComponent(normalizePath(virtualPath))}`, {
		method: "GET",
	});
}

type GlobToken =
	| { kind: "literal"; value: string }
	/** `?` — one character, never a separator. */
	| { kind: "any" }
	/** `*` — any run of characters inside one path segment. */
	| { kind: "segment" }
	/** `**` — any run of characters, separators included. */
	| { kind: "anypath" }
	| { kind: "class"; negated: boolean; ranges: Array<[string, string]> };

function parseClass(body: string): GlobToken {
	let content = body;
	let negated = false;
	if (content.startsWith("!") || content.startsWith("^")) {
		negated = true;
		content = content.slice(1);
	}
	const ranges: Array<[string, string]> = [];
	for (let index = 0; index < content.length; index += 1) {
		const character = content[index];
		// `a-z` is a range; a trailing `-` is a literal, as in every shell.
		if (content[index + 1] === "-" && index + 2 < content.length) {
			ranges.push([character, content[index + 2]]);
			index += 2;
		} else {
			ranges.push([character, character]);
		}
	}
	return { kind: "class", negated, ranges };
}

function tokenize(pattern: string): GlobToken[] {
	const tokens: GlobToken[] = [];
	let index = 0;
	while (index < pattern.length) {
		const character = pattern[index];
		if (character === "\\" && index + 1 < pattern.length) {
			tokens.push({ kind: "literal", value: pattern[index + 1] });
			index += 2;
			continue;
		}
		if (character === "*") {
			// A run of stars is one token; two or more is the separator-crossing
			// form. Collapsing them keeps `***` from behaving like three `*`s.
			let end = index;
			while (pattern[end] === "*") end += 1;
			tokens.push({ kind: end - index >= 2 ? "anypath" : "segment" });
			index = end;
			continue;
		}
		if (character === "?") {
			tokens.push({ kind: "any" });
			index += 1;
			continue;
		}
		if (character === "[") {
			const closing = pattern.indexOf("]", index + 1);
			// An unterminated `[` is a literal bracket, the way a shell reads it.
			if (closing !== -1) {
				tokens.push(parseClass(pattern.slice(index + 1, closing)));
				index = closing + 1;
				continue;
			}
		}
		tokens.push({ kind: "literal", value: character });
		index += 1;
	}
	return tokens;
}

function classMatches(token: GlobToken & { kind: "class" }, character: string): boolean {
	const inside = token.ranges.some(([low, high]) => character >= low && character <= high);
	return token.negated ? !inside : inside;
}

/**
 * Match a path against a doublestar glob, the dialect OpenList's
 * `custom_cache_policies` is written in. `*` and `?` and `[...]` stop at a
 * separator, `**` crosses them, and `\` escapes the next character.
 *
 * It is a small dynamic-programming match rather than a regular expression:
 * translating a glob to a regex is where the escaping bugs live, and the
 * pattern is one line of a config field, not a hot loop.
 */
export function matchGlob(pattern: string, value: string): boolean {
	const tokens = tokenize(pattern);
	// `previous[column]` is "the tokens so far match the first `column`
	// characters"; code units on both sides, so a surrogate pair counts twice
	// in the pattern and twice in the value.
	let previous = new Array<boolean>(value.length + 1).fill(false);
	previous[0] = true;
	for (const token of tokens) {
		const current = new Array<boolean>(value.length + 1).fill(false);
		if (token.kind === "anypath") {
			current[0] = previous[0];
			for (let column = 1; column <= value.length; column += 1) {
				current[column] = previous[column] || current[column - 1];
			}
		} else if (token.kind === "segment") {
			current[0] = previous[0];
			for (let column = 1; column <= value.length; column += 1) {
				current[column] = previous[column] || (current[column - 1] && value[column - 1] !== "/");
			}
		} else {
			for (let column = 1; column <= value.length; column += 1) {
				if (!previous[column - 1]) continue;
				const character = value[column - 1];
				if (token.kind === "literal") current[column] = character === token.value;
				else if (token.kind === "any") current[column] = character !== "/";
				else current[column] = character !== "/" && classMatches(token, character);
			}
		}
		previous = current;
	}
	return previous[value.length];
}

function minutesOr(value: unknown, fallback: number): number {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

/**
 * How long one directory's listing may be reused, in minutes. Zero means "do
 * not cache", which is also what a `cache_expiration` of 0 asks for.
 *
 * `custom_cache_policies` is one `pattern:minutes` rule per line and the first
 * rule whose glob matches wins — including the detail that a malformed line is
 * skipped rather than treated as a match, and that a rule whose minutes cannot
 * be read is passed over in favour of the next rule
 * (`internal/op/fs.go:83-107`). The glob is matched against the
 * storage-relative path, exactly as upstream does.
 */
export function cacheTtlMinutes(expiration: unknown, policies: unknown, path: string): number {
	const base = minutesOr(expiration, CACHE_EXPIRATION_DEFAULT_MINUTES);
	if (typeof policies !== "string" || !policies.trim()) return base;
	for (const line of policies.split("\n")) {
		const entry = line.trim();
		const colon = entry.indexOf(":");
		if (colon === -1) continue;
		if (!matchGlob(entry.slice(0, colon), path)) continue;
		// A TTL that is not a whole number is passed over rather than clamped:
		// `"60s"` means the author meant something this field cannot express, and
		// guessing 60 would cache for a minute past what they asked for.
		const minutes = Number(entry.slice(colon + 1));
		if (!Number.isInteger(minutes)) continue;
		return Math.max(0, minutes);
	}
	return base;
}

export interface ListTarget {
	config: StorageConfig;
	/** The storage-relative path, as the adapter expects it. */
	path: string;
	adapter: Pick<StorageAdapter, "list">;
}

/** Where to find the edge cache. Tests inject one; production takes the default. */
export interface CacheOverride {
	cache?: DirectoryCache | null;
}

export interface ListDirectoryOptions extends CacheOverride {
	/** Read past the cache and replace whatever it held. */
	refresh?: boolean;
}

/**
 * TTL for a storage's directory, honouring the driver's `noCache` flag: a
 * driver that declares it is never cached, whatever the record says, because
 * the form does not offer the fields either.
 */
function ttlFor(config: StorageConfig, path: string): number {
	if (findDriver(config.driver)?.config.noCache) return 0;
	return cacheTtlMinutes(config.cache_expiration, config.custom_cache_policies, path);
}

async function readEntry(cache: DirectoryCache, key: Request): Promise<FileObject[] | null> {
	try {
		const hit = await cache.match(key);
		if (!hit) return null;
		const content = (await hit.json()) as unknown;
		return Array.isArray(content) ? (content as FileObject[]) : null;
	} catch {
		// The cache is an optimisation, so a read that fails is just a miss. The
		// listing that follows replaces whatever was wrong with the entry.
		return null;
	}
}

async function writeEntry(cache: DirectoryCache, key: Request, content: FileObject[], ttl: number): Promise<void> {
	try {
		// Serialised here rather than handing over the array: the caller sorts and
		// merges the returned list, and the cached copy must not move with it.
		await cache.put(
			key,
			new Response(JSON.stringify(content), {
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": `max-age=${ttl * 60}`,
				},
			}),
		);
	} catch {
		// A write that fails costs the next request a listing, not this one.
	}
}

/**
 * List a directory through the cache. `refresh` skips the read *and* rewrites
 * the entry, which is what makes the Refresh button in the UI worth having.
 *
 * Only a non-empty listing is remembered: an empty one is far more often a
 * blip, a directory created a moment ago, or a path that does not exist yet
 * than a fact worth holding, and OpenList skips caching it for the same reason
 * (`internal/op/fs.go:109-112`). An empty result *drops* any entry instead of
 * leaving it alone — otherwise a `refresh` that finds the directory empty would
 * return nothing once and then hand the previous contents back for the rest of
 * the TTL, which is worse than not caching at all.
 */
export async function listDirectory(
	target: ListTarget,
	virtualPath: string,
	options: ListDirectoryOptions = {},
): Promise<FileObject[]> {
	const cache = options.cache === undefined ? edgeCache() : options.cache;
	const ttl = ttlFor(target.config, target.path);
	const enabled = cache !== null && ttl > 0;
	const key = directoryCacheKey(virtualPath);

	if (enabled && !options.refresh) {
		const cached = await readEntry(cache, key);
		if (cached) return cached;
	}

	const result = await target.adapter.list(target.path, {
		page: 1,
		per_page: 0,
		refresh: options.refresh ?? false,
	});
	const content = result.content ?? [];
	if (!enabled) return content;
	if (content.length > 0) await writeEntry(cache, key, content, ttl);
	else await invalidateDirectory(virtualPath, { cache });
	return content;
}

/**
 * Drop a directory's cached listing after its contents changed. Removing a
 * directory does not reach the directories below it — the edge cache cannot be
 * enumerated — so those rely on their own TTL. See the note at the top.
 */
export async function invalidateDirectory(virtualPath: string, options: CacheOverride = {}): Promise<void> {
	const cache = options.cache === undefined ? edgeCache() : options.cache;
	if (!cache) return;
	try {
		await cache.delete(directoryCacheKey(virtualPath));
	} catch {
		// Same reasoning as the write: the cache must never fail a request.
	}
}

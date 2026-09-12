import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CACHE_ORIGIN,
	cacheTtlMinutes,
	directoryCacheKey,
	edgeCache,
	invalidateDirectory,
	listDirectory,
	matchGlob,
	type DirectoryCache,
} from "./cache";
import { CACHE_EXPIRATION_DEFAULT_MINUTES, type FileObject, type ListOptions, type StorageConfig } from "./types";

afterEach(() => {
	vi.unstubAllGlobals();
});

function config(overrides: Partial<StorageConfig> = {}): StorageConfig {
	return {
		id: 1,
		mount_path: "/m",
		order: 0,
		driver: "object",
		status: "work",
		addition: "{}",
		remark: "",
		disabled: false,
		...overrides,
	};
}

function item(name: string): FileObject {
	return {
		name,
		size: 1,
		is_dir: false,
		modified: "2024-01-01T00:00:00.000Z",
		created: "2024-01-01T00:00:00.000Z",
		path: name,
	};
}

/** An in-memory stand-in for `caches.default`, with a record of what it was asked. */
function fakeCache() {
	const store = new Map<string, Response>();
	const seen = { matched: [] as string[], put: [] as string[], deleted: [] as string[] };
	const cache: DirectoryCache = {
		match: async (request) => {
			seen.matched.push(request.url);
			// Cloned because a Response body can only be read once, and a real
			// cache hands out a fresh body per match.
			return store.get(request.url)?.clone();
		},
		put: async (request, response) => {
			seen.put.push(request.url);
			store.set(request.url, response);
		},
		delete: async (request) => {
			seen.deleted.push(request.url);
			return store.delete(request.url);
		},
	};
	return { cache, store, seen };
}

/** Records every listing the cache layer asked the adapter for. */
function adapter(content: FileObject[]) {
	const calls: Array<{ path: string; refresh: boolean }> = [];
	return {
		calls,
		list: async (path: string, options: ListOptions) => {
			calls.push({ path, refresh: options.refresh });
			return { content, total: content.length };
		},
	};
}

describe("matchGlob", () => {
	it("matches literals exactly", () => {
		expect(matchGlob("/docs", "/docs")).toBe(true);
		expect(matchGlob("/docs", "/doc")).toBe(false);
	});

	it("keeps a single star inside one path segment", () => {
		expect(matchGlob("/docs/*.md", "/docs/a.md")).toBe(true);
		expect(matchGlob("/docs/*.md", "/docs/sub/a.md")).toBe(false);
	});

	it("lets a double star cross separators", () => {
		expect(matchGlob("/docs/**", "/docs/sub/deep/a.md")).toBe(true);
		expect(matchGlob("/**/*.md", "/docs/a.md")).toBe(true);
	});

	it("reads a run of three stars as the crossing form", () => {
		// Collapsing the run is what stops `***` behaving like three separate
		// one-segment stars, which would never match a nested path.
		expect(matchGlob("/docs/***", "/docs/sub/a")).toBe(true);
	});

	it("matches one character with `?`, never a separator", () => {
		expect(matchGlob("/a?c", "/abc")).toBe(true);
		expect(matchGlob("/a?c", "/a/c")).toBe(false);
	});

	it("matches character classes, ranges and their negation", () => {
		expect(matchGlob("/[abc].txt", "/b.txt")).toBe(true);
		expect(matchGlob("/[abc].txt", "/d.txt")).toBe(false);
		expect(matchGlob("/[a-c].txt", "/b.txt")).toBe(true);
		expect(matchGlob("/[!abc].txt", "/d.txt")).toBe(true);
		expect(matchGlob("/[^abc].txt", "/d.txt")).toBe(true);
	});

	it("escapes the character after a backslash", () => {
		expect(matchGlob("/a\\*b", "/a*b")).toBe(true);
		expect(matchGlob("/a\\*b", "/axb")).toBe(false);
	});

	it("treats an unterminated bracket as a literal", () => {
		expect(matchGlob("/a[", "/a[")).toBe(true);
	});

	it("matches an empty pattern only against an empty value", () => {
		expect(matchGlob("", "")).toBe(true);
		expect(matchGlob("", "/a")).toBe(false);
	});
});

describe("cacheTtlMinutes", () => {
	it("falls back to OpenList's 30 minute default", () => {
		expect(CACHE_EXPIRATION_DEFAULT_MINUTES).toBe(30);
		expect(cacheTtlMinutes(undefined, undefined, "/a")).toBe(CACHE_EXPIRATION_DEFAULT_MINUTES);
	});

	it("reads a number, including one that arrived as a string", () => {
		expect(cacheTtlMinutes(10, undefined, "/a")).toBe(10);
		expect(cacheTtlMinutes("10", undefined, "/a")).toBe(10);
	});

	it("clamps a negative value to zero, which the caller reads as do-not-cache", () => {
		expect(cacheTtlMinutes(-5, undefined, "/a")).toBe(0);
	});

	it("falls back to the default when the value cannot be read at all", () => {
		expect(cacheTtlMinutes("nonsense", undefined, "/a")).toBe(CACHE_EXPIRATION_DEFAULT_MINUTES);
	});

	it("lets a matching policy override the record's value", () => {
		expect(cacheTtlMinutes(30, "/media/**:60", "/media/a")).toBe(60);
		expect(cacheTtlMinutes(30, "/media/**:60", "/other")).toBe(30);
	});

	it("takes the first matching rule", () => {
		expect(cacheTtlMinutes(30, "/**:1\n/media/**:60", "/media/a")).toBe(1);
	});

	it("matches the storage-relative path, leading slash included", () => {
		// The path a policy sees is the path the adapter sees (`/docs/a`), not the
		// mount-stripped one, so a pattern has to carry the leading slash. This
		// mirrors OpenList, which matches the glob against the same path.
		expect(cacheTtlMinutes(30, "/docs/**:5", "/docs/a")).toBe(5);
		expect(cacheTtlMinutes(30, "docs/**:5", "/docs/a")).toBe(30);
	});

	it("skips a line that is not a pattern:minutes pair", () => {
		expect(cacheTtlMinutes(30, "no-colon-here\n/media/**:7", "/media/a")).toBe(7);
	});

	it("passes over a rule whose minutes cannot be read", () => {
		expect(cacheTtlMinutes(30, "/**:abc\n/media/**:9", "/media/a")).toBe(9);
		expect(cacheTtlMinutes(30, "/media/**:60s", "/media/a")).toBe(30);
	});

	it("ignores policies that are not text", () => {
		expect(cacheTtlMinutes(30, 42, "/media/a")).toBe(30);
		expect(cacheTtlMinutes(30, "   ", "/media/a")).toBe(30);
	});
});

describe("directoryCacheKey", () => {
	it("keys on the virtual path under a stable synthetic origin", () => {
		const key = directoryCacheKey("/waynecos/docs");
		expect(key.method).toBe("GET");
		expect(new URL(key.url).origin).toBe(CACHE_ORIGIN);
		expect(new URL(key.url).searchParams.get("path")).toBe("/waynecos/docs");
	});

	it("normalizes the path before it becomes a key", () => {
		expect(directoryCacheKey("/a//b/./c").url).toBe(directoryCacheKey("/a/b/c").url);
	});

	it("keeps a name holding a query or fragment character distinct", () => {
		// Interpolated unencoded, `?` would begin a query and `#` a fragment, so
		// these three directories would collapse onto one key.
		expect(directoryCacheKey("/a?b").url).not.toBe(directoryCacheKey("/a").url);
		expect(directoryCacheKey("/a#b").url).not.toBe(directoryCacheKey("/a").url);
		expect(new URL(directoryCacheKey("/a?b").url).searchParams.get("path")).toBe("/a?b");
	});
});

describe("edgeCache", () => {
	it("is null where the runtime has no cache, as under Node", () => {
		expect(edgeCache()).toBeNull();
	});

	it("returns the default cache when the runtime has one", () => {
		const { cache } = fakeCache();
		vi.stubGlobal("caches", { default: cache });
		expect(edgeCache()).toBe(cache);
	});
});

describe("listDirectory", () => {
	it("reads through to the adapter on a miss and remembers the listing", async () => {
		const { cache, seen } = fakeCache();
		const stub = adapter([item("a.txt")]);
		const result = await listDirectory({ config: config(), path: "/docs", adapter: stub }, "/m/docs", { cache });
		expect(result.map((entry) => entry.name)).toEqual(["a.txt"]);
		expect(stub.calls).toEqual([{ path: "/docs", refresh: false }]);
		expect(seen.put).toEqual([directoryCacheKey("/m/docs").url]);
	});

	it("serves a second read from the cache without touching the adapter", async () => {
		const { cache } = fakeCache();
		const stub = adapter([item("a.txt")]);
		const target = { config: config(), path: "/docs", adapter: stub };
		await listDirectory(target, "/m/docs", { cache });
		const second = await listDirectory(target, "/m/docs", { cache });
		expect(second.map((entry) => entry.name)).toEqual(["a.txt"]);
		expect(stub.calls).toHaveLength(1);
	});

	it("hands back a copy, so a caller that sorts or mutates cannot corrupt the entry", async () => {
		const { cache } = fakeCache();
		const stub = adapter([item("a.txt")]);
		const target = { config: config(), path: "/docs", adapter: stub };
		const first = await listDirectory(target, "/m/docs", { cache });
		first.push(item("injected.txt"));
		const second = await listDirectory(target, "/m/docs", { cache });
		expect(second.map((entry) => entry.name)).toEqual(["a.txt"]);
	});

	it("reads past the cache and replaces the entry when refresh is set", async () => {
		const { cache, seen } = fakeCache();
		const stub = adapter([item("a.txt")]);
		const target = { config: config(), path: "/docs", adapter: stub };
		await listDirectory(target, "/m/docs", { cache });
		const refreshed = await listDirectory(target, "/m/docs", { cache, refresh: true });
		expect(refreshed.map((entry) => entry.name)).toEqual(["a.txt"]);
		expect(stub.calls).toEqual([
			{ path: "/docs", refresh: false },
			{ path: "/docs", refresh: true },
		]);
		expect(seen.put).toHaveLength(2);
	});

	it("never caches when the record asks for zero minutes", async () => {
		const { cache, seen } = fakeCache();
		const stub = adapter([item("a.txt")]);
		const target = { config: config({ cache_expiration: 0 }), path: "/docs", adapter: stub };
		await listDirectory(target, "/m/docs", { cache });
		await listDirectory(target, "/m/docs", { cache });
		expect(stub.calls).toHaveLength(2);
		expect(seen.put).toHaveLength(0);
	});

	it("honours a policy that zeroes the TTL for one subtree", async () => {
		const { cache, seen } = fakeCache();
		const stub = adapter([item("a.txt")]);
		// `/docs/**` needs the trailing separator, so it covers `/docs/sub` and
		// not `/docs` itself — the same reading a shell gives the pattern.
		const target = {
			config: config({ cache_expiration: 30, custom_cache_policies: "/docs/**:0" }),
			path: "/docs/sub",
			adapter: stub,
		};
		await listDirectory(target, "/m/docs/sub", { cache });
		expect(stub.calls).toHaveLength(1);
		expect(seen.put).toHaveLength(0);
	});

	it("does not remember an empty listing, and drops the entry it replaces", async () => {
		const { cache, seen } = fakeCache();
		const populated = adapter([item("a.txt")]);
		await listDirectory({ config: config(), path: "/docs", adapter: populated }, "/m/docs", { cache });
		const empty = adapter([]);
		const result = await listDirectory({ config: config(), path: "/docs", adapter: empty }, "/m/docs", {
			cache,
			refresh: true,
		});
		expect(result).toEqual([]);
		// The empty result is not stored, and the entry it found is gone — leaving
		// it would serve the deleted contents back for the rest of the TTL.
		expect(seen.put).toHaveLength(1);
		expect(seen.deleted).toEqual([directoryCacheKey("/m/docs").url]);
		const third = await listDirectory({ config: config(), path: "/docs", adapter: populated }, "/m/docs", { cache });
		expect(third.map((entry) => entry.name)).toEqual(["a.txt"]);
	});

	it("passes straight through when the runtime has no cache", async () => {
		const stub = adapter([item("a.txt")]);
		const result = await listDirectory({ config: config(), path: "/docs", adapter: stub }, "/m/docs", { cache: null });
		expect(result.map((entry) => entry.name)).toEqual(["a.txt"]);
		expect(stub.calls).toHaveLength(1);
	});

	it("treats an unreadable entry as a miss", async () => {
		const { cache, store } = fakeCache();
		store.set(directoryCacheKey("/m/docs").url, new Response("not json at all"));
		const stub = adapter([item("a.txt")]);
		const result = await listDirectory({ config: config(), path: "/docs", adapter: stub }, "/m/docs", { cache });
		expect(result.map((entry) => entry.name)).toEqual(["a.txt"]);
	});

	it("treats a failing cache as a miss and a failed write as harmless", async () => {
		const broken: DirectoryCache = {
			match: async () => {
				throw new Error("cache read failed");
			},
			put: async () => {
				throw new Error("cache write failed");
			},
			delete: async () => {
				throw new Error("cache delete failed");
			},
		};
		const stub = adapter([item("a.txt")]);
		const result = await listDirectory({ config: config(), path: "/docs", adapter: stub }, "/m/docs", {
			cache: broken,
		});
		expect(result.map((entry) => entry.name)).toEqual(["a.txt"]);
	});
});

describe("invalidateDirectory", () => {
	it("drops exactly the entry for that path", async () => {
		const { cache, seen } = fakeCache();
		await invalidateDirectory("/m/docs", { cache });
		expect(seen.deleted).toEqual([directoryCacheKey("/m/docs").url]);
	});

	it("does nothing without a cache", async () => {
		await expect(invalidateDirectory("/m/docs", { cache: null })).resolves.toBeUndefined();
	});

	it("swallows a failing delete", async () => {
		const broken: DirectoryCache = {
			match: async () => undefined,
			put: async () => {},
			delete: async () => {
				throw new Error("delete failed");
			},
		};
		await expect(invalidateDirectory("/m/docs", { cache: broken })).resolves.toBeUndefined();
	});
});

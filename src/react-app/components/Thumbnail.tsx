import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getToken, readFile } from "../lib/api";
import { kindOf, withMime } from "../lib/format";
import { Icon } from "../ui/Icon";

/**
 * Thumbnails for the grid and image layouts.
 *
 * Every file goes through `/d/*`, which is authenticated by header, so an
 * `<img src>` cannot point at it — the browser sends no `Authorization` for a
 * subresource. Each thumbnail is therefore fetched and turned into an object URL.
 *
 * That is expensive enough to be worth three rules:
 *
 * - **Nothing is fetched until the tile is on screen.** An `IntersectionObserver`
 *   with a generous margin starts the read roughly one screen early, so a scroll
 *   into the grid does not show a wall of spinners, and a 2000-entry directory
 *   does not issue 2000 reads for tiles nobody looked at.
 * - **The bytes are shared.** Two tiles can show the same path (a re-render, a
 *   duplicate from a search); the cache below keys by path so the second one waits
 *   on the first request instead of starting its own.
 * - **The URL is revoked when the last tile using it goes away.** An object URL
 *   pins its blob until revoked, and a directory of photographs is hundreds of
 *   megabytes; a component that forgot to revoke would hold them for the life of
 *   the tab.
 */

type CacheEntry = { url: string; refs: number };
const cache = new Map<string, CacheEntry>();
/** Paths whose read failed, so a retry is only made when the tile is rebuilt. */
const failures = new Set<string>();
const inFlight = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

async function load(path: string): Promise<string> {
	const existing = cache.get(path);
	if (existing) {
		existing.refs += 1;
		return existing.url;
	}
	const pending = inFlight.get(path);
	if (pending) {
		const url = await pending;
		const entry = cache.get(path);
		if (entry) entry.refs += 1;
		return url;
	}
	const request = (async () => {
		const response = await readFile(path);
		const blob = withMime(await response.blob(), path);
		const url = URL.createObjectURL(blob);
		cache.set(path, { url, refs: 0 });
		inFlight.delete(path);
		emit();
		return url;
	})();
	inFlight.set(path, request);
	try {
		return await request;
	} catch (error) {
		inFlight.delete(path);
		throw error;
	}
}

function release(path: string) {
	const entry = cache.get(path);
	if (!entry) return;
	entry.refs -= 1;
	if (entry.refs > 0) return;
	URL.revokeObjectURL(entry.url);
	cache.delete(path);
	emit();
}

/**
 * The cached object URL for a path, or `null` while it is not loaded.
 *
 * The cache *is* an external store, so it is read through `useSyncExternalStore` rather
 * than mirrored into component state: the entry can be filled by another tile's request,
 * and a local copy would neither see that nor have a way to. The reference count is what
 * keeps a URL alive while any tile is showing it; the release runs in the effect's cleanup,
 * which is the only place a React component can say "I am done with this".
 */
export function useThumbnail(path: string, enabled: boolean): { url: string | null; failed: boolean } {
	const snapshot = useCallback((p: string) => cache.get(p)?.url ?? null, []);
	const url = useSyncExternalStore(
		subscribe,
		() => (enabled ? snapshot(path) : null),
		() => null,
	);

	useEffect(() => {
		if (!enabled || !path) return;
		let live = true;
		// A cached entry is claimed synchronously; anything else is requested and the
		// store's own notification brings the result in.
		load(path).catch(() => {
			if (live) failures.add(path);
		});
		return () => {
			live = false;
			release(path);
		};
	}, [enabled, path]);

	return { url, failed: enabled ? failures.has(path) && !url : false };
}

/** Subscribes a component to thumbnail cache changes. */
function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Whether an element has come near the viewport.
 *
 * One shared observer rather than one per tile: 2000 observers is a real cost, and
 * the callback only needs the element's identity. `rootMargin` is what buys the
 * "one screen early" behaviour — the read starts before the tile is visible, so a
 * scroll into the grid does not arrive at a wall of spinners.
 *
 * An element that was already seen is remembered, so a tile that scrolls out and
 * back does not re-observe and does not re-fetch.
 */
const seen = new WeakSet<Element>();
const watchers = new Map<Element, () => void>();
const observer =
	typeof IntersectionObserver === "undefined"
		? null
		: new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						seen.add(entry.target);
						watchers.get(entry.target)?.();
						observer?.unobserve(entry.target);
					}
				},
				{ rootMargin: "400px 0px" },
			);

export function useNearViewport<T extends Element>(): [(node: T | null) => void, boolean] {
	const [node, setNode] = useState<T | null>(null);
	// Initial value rather than an effect: "no `IntersectionObserver`" is knowable at
	// mount, and everything is near when nothing can report otherwise.
	const [near, setNear] = useState(() => observer === null);

	useEffect(() => {
		if (!node) return;
		if (seen.has(node)) {
			// Already observed once: the answer is known, and it is delivered from a
			// microtask so it is not a synchronous write inside the effect body.
			queueMicrotask(() => setNear(true));
			return;
		}
		if (!observer) return;
		const reveal = () => setNear(true);
		watchers.set(node, reveal);
		observer.observe(node);
		return () => {
			watchers.delete(node);
			observer.unobserve(node);
		};
	}, [node]);

	return [setNode, near];
}

/**
 * A tile's picture, or its type icon.
 *
 * Three states, and the third is the interesting one: while the bytes are in
 * flight the tile shows the type icon at low opacity rather than a spinner, because
 * a grid of spinners reads as "broken" and a grid of greyed glyphs reads as "still
 * coming". A failure falls back to the glyph too — a broken image in a list of
 * photos is worse than a known icon.
 */
export function Thumbnail({
	path,
	name,
	className = "",
	iconClassName = "size-8",
	rounded = "rounded-lg",
	alt = "",
}: {
	path: string;
	name: string;
	className?: string;
	iconClassName?: string;
	rounded?: string;
	alt?: string;
}) {
	const kind = kindOf(name);
	const thumbnailable = kind === "image" || kind === "video";
	const [attach, near] = useNearViewport<HTMLDivElement>();
	const { url, failed } = useThumbnail(path, thumbnailable && near);

	if (url && !failed) {
		return (
			<div ref={attach} className={`flex items-center justify-center overflow-hidden ${className}`}>
				<img
					src={url}
					alt={alt}
					loading="lazy"
					decoding="async"
					className={`max-h-full max-w-full object-contain image-outline ${rounded}`}
				/>
			</div>
		);
	}

	return (
		<div ref={attach} className={`flex items-center justify-center overflow-hidden ${className}`}>
			<Icon
				name={kind === "video" ? "file-video" : kind === "image" ? "file-image" : kindIcon(name)}
				className={`${iconClassName} ${thumbnailable && near && !failed ? "text-neutral-7" : "text-main"}`}
				strokeWidth={1.25}
			/>
		</div>
	);
}

/** The glyph for a kind, for the places that are not a thumbnail. */
export function kindIcon(name: string, isDirectory = false) {
	const kind = kindOf(name, isDirectory);
	switch (kind) {
		case "directory":
			return "folder" as const;
		case "archive":
			return "file-archive" as const;
		case "audio":
			return "file-audio" as const;
		case "image":
			return "file-image" as const;
		case "pdf":
			return "file-pdf" as const;
		case "video":
			return "file-video" as const;
		case "markdown":
		case "text":
		case "html":
		case "url":
			return "file-text" as const;
		default:
			return "file" as const;
	}
}

/**
 * Whether a path can be shown as a picture.
 *
 * Used to decide whether a click on the *icon* opens the lightbox — §4.6 has the
 * icon of an image act differently from the icon of anything else.
 */
export function isPicture(name: string) {
	return kindOf(name) === "image";
}

/** The token, for the two places a URL has to be fetchable (a download link). */
export function hasSession() {
	return Boolean(getToken());
}

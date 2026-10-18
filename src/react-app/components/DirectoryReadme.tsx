import { useEffect, useState } from "react";
import { readFile } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import type { FileObject } from "../lib/types";
import { normalizePath, parentOf } from "../lib/paths";
import { useT } from "../hooks/useStore";

/**
 * A directory's own markdown, above and below the listing (§3.1, §3.5).
 *
 * §3 puts a card above the object card and another below it, and defines where each
 * comes from: one of `header.md` / `top.md` / `index.md` in the directory itself, or the
 * metadata rule's `header` field; and one of `readme.md` / `footer.md` / `bottom.md`, or
 * the rule's `readme`. A *file* in the directory wins over the rule, which is what makes
 * `readme.md` the natural thing to drop into a folder.
 *
 * The Worker already resolved which rule applies and returned its text as `header` /
 * `readme` on the listing, so this only has to look for the file and then fall back. A
 * rule holding an `http(s)` URL is fetched rather than rendered — that is how OpenList
 * lets one rule point at a readme hosted elsewhere.
 *
 * Nothing renders when there is no source, which is the common case and why the two
 * cards cost nothing in a directory that has neither.
 */
const FILES = {
	header: ["header.md", "top.md", "index.md"],
	readme: ["readme.md", "footer.md", "bottom.md"],
} as const;

export function DirectoryReadme({
	slot,
	path,
	items,
	inline,
	onNavigate,
}: {
	slot: "header" | "readme";
	path: string;
	items: readonly FileObject[];
	/** The metadata rule's text, from the listing. */
	inline?: string;
	onNavigate?: (path: string) => void;
}) {
	const t = useT();
	const [markdown, setMarkdown] = useState<string | null>(null);

	// The file in the directory, if there is one.
	const file = items.find(
		(item) => !item.is_dir && (FILES[slot] as readonly string[]).includes(item.name.toLowerCase()),
	);

	useEffect(() => {
		let cancelled = false;
		const remote = inline?.trim().match(/^https?:\/\//i) ? inline.trim() : null;

		(async () => {
			if (file) {
				try {
					const response = await readFile(file.path);
					const text = await response.text();
					if (!cancelled) setMarkdown(text);
					return;
				} catch {
					// Fall through to the rule rather than showing nothing: a directory
					// whose readme cannot be read is still described by its rule.
				}
			}
			if (remote) {
				try {
					const response = await fetch(remote);
					const text = await response.text();
					if (!cancelled) setMarkdown(text);
					return;
				} catch {
					if (!cancelled) setMarkdown(null);
					return;
				}
			}
			if (!cancelled) setMarkdown(inline?.trim() ? inline : null);
		})();

		return () => {
			cancelled = true;
		};
	}, [file, inline]);

	if (!markdown) return null;

	return (
		<div className="w-full rounded-xl bg-neutral-2 px-3 py-2">
			<div
				className="markdown-body text-sm"
				onClick={(event) => {
					// A relative link is a path in this listing, not a URL; letting the
					// browser navigate to `/docs/x` would leave the app's router and,
					// worse, treat the virtual path as a server path.
					if (!onNavigate) return;
					const anchor = (event.target as HTMLElement).closest("a");
					if (!anchor) return;
					const href = anchor.getAttribute("href");
					if (!href || /^(#|[a-z]+:)/i.test(href)) return;
					event.preventDefault();
					onNavigate(normalizePath(href.startsWith("/") ? href : `${parentOf(path)}/${href}`));
				}}
				dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
			/>
			{slot === "readme" && !markdown && <span className="sr-only">{t("home.empty")}</span>}
		</div>
	);
}

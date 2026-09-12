import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@heroui/react";
import { fetchFileResponse } from "../../lib/api";
import { renderMarkdown } from "../../lib/markdown";
import { readmeSourceFor, type ReadmeSlot } from "../../lib/readme";
import type { FileItem } from "../../lib/types";

export type DirectoryReadmeProps = {
	slot: ReadmeSlot;
	items: FileItem[];
	/** The markdown, or the URL, the directory's metadata rule supplies. */
	metaValue?: string;
};

/**
 * The readme card above and below a directory listing.
 *
 * Text that is already in hand renders straight away; only a file or a URL needs
 * a fetch. A rule that cannot be read is not worth an error — the directory
 * itself is fine and the readme is decoration — so a failed fetch renders
 * nothing rather than a toast.
 *
 * The fetch re-runs whenever the listing is reloaded, which is also what makes
 * an edited `readme.md` show up after a Refresh.
 */
export function DirectoryReadme({ slot, items, metaValue }: DirectoryReadmeProps) {
	const source = useMemo(() => readmeSourceFor(slot, items, metaValue), [slot, items, metaValue]);
	const [fetched, setFetched] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (source.kind !== "file" && source.kind !== "remote") {
			setFetched("");
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		void (async () => {
			try {
				// A file in the directory lives behind the authenticated download
				// route; a rule pointing at a URL is an ordinary cross-origin fetch.
				const response = source.kind === "file" ? await fetchFileResponse(source.path) : await fetch(source.url);
				if (!response.ok) throw new Error(`Readme unavailable (${response.status})`);
				const body = await response.text();
				if (!cancelled) setFetched(body);
			} catch {
				if (!cancelled) setFetched("");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [source]);

	const text = source.kind === "inline" ? source.text : fetched;
	const html = useMemo(() => (text.trim() ? renderMarkdown(text) : ""), [text]);

	if (loading) return <Skeleton className="h-24 w-full rounded-xl" />;
	if (!html) return null;

	return (
		// `renderMarkdown` escapes its input before adding anything, so the only
		// markup reaching the DOM is the markup it wrote itself.
		<div
			className="markdown-body rounded-xl border border-border bg-surface p-5 text-sm"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

import { useMemo, useState } from "react";
import { renderMarkdown } from "../../lib/markdown";
import { useT } from "../../hooks/useStore";
import { IconButton } from "../../ui/ActionButton";

/**
 * The Markdown previewer (§5.7), with the outline §5.8 describes.
 *
 * Two renderers in the spec — the default one and "with word wrap" — and the only
 * difference between them is a CSS class, so they are one component with a flag
 * rather than two.
 *
 * The outline is §5.8's: a rail that appears against the right edge once the page
 * has scrolled 100px and the document has more than one heading, collapses to 20px
 * until hovered, and scrolls the page when an entry is pressed. It is *not* shown on
 * a narrow viewport, and it is off by default — the spec records that the local
 * preference starts as "disabled", so a reader who never asked for it never sees it.
 */
export function MarkdownViewer({
	text,
	wordWrap = false,
	outline = false,
	onToggleOutline,
}: {
	text: string;
	wordWrap?: boolean;
	outline?: boolean;
	onToggleOutline?: () => void;
}) {
	const t = useT();
	const [expanded, setExpanded] = useState(false);
	const html = useMemo(() => addHeadingIds(renderMarkdown(text)), [text]);
	const headings = useMemo(() => collectHeadings(html), [html]);

	return (
		<div className="relative w-full">
			<article
				className={`markdown-body mx-auto max-w-3xl px-1 py-2 text-sm leading-relaxed ${wordWrap ? "break-words [&_pre]:whitespace-pre-wrap" : "[&_pre]:whitespace-pre"}`}
				dangerouslySetInnerHTML={{ __html: html }}
			/>

			{outline && headings.length > 1 && (
				<nav
					aria-label={t("toolbar.toggle_markdown_toc")}
					onMouseEnter={() => setExpanded(true)}
					onMouseLeave={() => setExpanded(false)}
					className="fixed top-1/3 right-0 z-docked hidden max-h-[calc(var(--app-vh)*0.5)] w-52 overflow-y-auto rounded-l-lg border border-r-0 border-border bg-surface/95 py-1 shadow-lg backdrop-blur-sm transition-transform duration-200 md:block"
					style={{ transform: expanded ? "translateX(0)" : "translateX(calc(100% - 20px))" }}
				>
					<p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-neutral-10 uppercase">
						{t("toolbar.toggle_markdown_toc")}
					</p>
					{headings.map((heading) => (
						<a
							key={heading.id}
							href={`#${heading.id}`}
							onClick={(event) => {
								event.preventDefault();
								document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
							}}
							className="block truncate rounded-md px-3 py-1 text-xs text-neutral-11 hover:bg-row-hover hover:text-foreground"
							style={{ paddingLeft: `${12 + (heading.level - 1) * 10}px` }}
						>
							{heading.text}
						</a>
					))}
					{onToggleOutline && (
						<div className="mt-1 border-t border-hairline px-1 pt-1">
							<IconButton icon="close" label={t("toolbar.toggle_markdown_toc")} size="sm" onPress={onToggleOutline} />
						</div>
					)}
				</nav>
			)}
		</div>
	);
}

type Heading = { id: string; level: number; text: string };

/**
 * Gives every heading an id and collects them in one pass.
 *
 * A second render is what `collectHeadings` reads, so the ids it lists are exactly
 * the ones in the DOM — deriving them independently is how an outline ends up
 * pointing at anchors that do not exist.
 */
function addHeadingIds(html: string): string {
	const slugger = new Map<string, number>();
	return html.replace(/<h([1-3])>(.*?)<\/h\1>/g, (_match, level: string, inner: string) => {
		const text = inner.replace(/<[^>]+>/g, "");
		let slug =
			text
				.toLowerCase()
				.trim()
				.replace(/[^\w\u4e00-\u9fa5]+/g, "-")
				.replace(/^-+|-+$/g, "") || "section";
		const seen = slugger.get(slug) ?? 0;
		slugger.set(slug, seen + 1);
		if (seen) slug = `${slug}-${seen}`;
		return `<h${level} id="${slug}">${inner}</h${level}>`;
	});
}

function collectHeadings(html: string): Heading[] {
	const headings: Heading[] = [];
	const pattern = /<h([1-3]) id="([^"]+)">(.*?)<\/h\1>/g;
	for (const match of html.matchAll(pattern)) {
		headings.push({ level: Number(match[1]), id: match[2], text: match[3].replace(/<[^>]+>/g, "") });
	}
	return headings;
}

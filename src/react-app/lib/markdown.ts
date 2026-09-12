/**
 * A deliberately small Markdown renderer.
 *
 * The source is escaped before anything is added to it, so the only tags in the
 * output are the ones written here — a file cannot inject markup through this
 * path, and the result is safe to hand to `dangerouslySetInnerHTML`. Link
 * targets go through an allow-list for the same reason: `[x](javascript:…)`
 * must not survive.
 *
 * Supported: ATX headings, fenced code blocks, blockquotes, ordered and
 * unordered lists, horizontal rules, paragraphs, and inline bold, italic,
 * strikethrough, code and links. Not supported: tables, nested lists, images,
 * reference links, raw HTML.
 */

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/**
 * The one place a link target is accepted. Relative targets are kept as they
 * are; everything else has to name a scheme we are willing to hand a browser.
 */
export function safeHref(href: string): string | null {
	if (href.startsWith("/") || href.startsWith("#")) return href;
	if (/^(https?:|mailto:)/i.test(href)) return href;
	return null;
}

/**
 * One pass over the line, so a construct inside a code span stays literal:
 * matching `` `**x**` `` as code first means the emphasis rule never sees it.
 *
 * The link target allows one level of balanced parentheses, because
 * `…/A_(b)` is a real URL and stopping at the first `)` would leave the rest of
 * it behind as stray text.
 */
const INLINE_PATTERN =
	/`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]+)\]\(((?:[^()\s]|\([^()]*\))+)\)/g;

function inline(text: string): string {
	// The matches are collected against a *copy* of the pattern before anything
	// recurses. A single shared regex cannot be used here: the nested call would
	// reset its `lastIndex`, the outer loop would restart from the same match, and
	// the output would grow until the string length overflows.
	const matches = [...text.matchAll(new RegExp(INLINE_PATTERN.source, "g"))];
	let output = "";
	let cursor = 0;
	for (const match of matches) {
		output += escapeHtml(text.slice(cursor, match.index));
		const [, code, boldStar, boldUnderscore, strike, italicStar, italicUnderscore, linkText, href] = match;
		const bold = boldStar ?? boldUnderscore;
		const italic = italicStar ?? italicUnderscore;
		if (code !== undefined) {
			output += `<code>${escapeHtml(code)}</code>`;
		} else if (bold !== undefined) {
			output += `<strong>${inline(bold)}</strong>`;
		} else if (strike !== undefined) {
			output += `<del>${inline(strike)}</del>`;
		} else if (italic !== undefined) {
			output += `<em>${inline(italic)}</em>`;
		} else if (linkText !== undefined && href !== undefined) {
			const target = safeHref(href);
			// An unusable scheme leaves the label behind rather than dropping it.
			output += target
				? `<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${inline(linkText)}</a>`
				: inline(linkText);
		}
		cursor = match.index + match[0].length;
	}
	return output + escapeHtml(text.slice(cursor));
}

const FENCE = /^```\s*([\w+#-]*)\s*$/;
/** Only a line of nothing but backticks closes a fence; ```` ```js ```` does not. */
const CLOSING_FENCE = /^```+\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^>\s?/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/** Whether a line opens a block, which ends the paragraph being collected. */
function startsBlock(line: string): boolean {
	return (
		FENCE.test(line) ||
		HEADING.test(line) ||
		RULE.test(line) ||
		QUOTE.test(line) ||
		BULLET.test(line) ||
		NUMBERED.test(line)
	);
}

function collectList(lines: string[], start: number, pattern: RegExp, tag: "ul" | "ol", output: string[]): number {
	const items: string[] = [];
	let index = start;
	while (index < lines.length) {
		const match = pattern.exec(lines[index]);
		if (!match) break;
		items.push(`<li>${inline(match[1].trim())}</li>`);
		index += 1;
	}
	output.push(`<${tag}>${items.join("")}</${tag}>`);
	return index;
}

export function renderMarkdown(source: string): string {
	const lines = source.replace(/\r\n?/g, "\n").split("\n");
	const output: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index += 1;
			continue;
		}

		const fence = FENCE.exec(line);
		if (fence) {
			const body: string[] = [];
			index += 1;
			while (index < lines.length && !CLOSING_FENCE.test(lines[index])) {
				body.push(lines[index]);
				index += 1;
			}
			// An unterminated fence runs to the end of the file, like every other
			// renderer does, so a truncated document still shows its code.
			index += 1;
			const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : "";
			output.push(`<pre><code${language}>${escapeHtml(body.join("\n"))}</code></pre>`);
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading) {
			const level = heading[1].length;
			output.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
			index += 1;
			continue;
		}

		if (RULE.test(line)) {
			output.push("<hr />");
			index += 1;
			continue;
		}

		if (QUOTE.test(line)) {
			const body: string[] = [];
			while (index < lines.length && QUOTE.test(lines[index])) {
				body.push(lines[index].replace(QUOTE, ""));
				index += 1;
			}
			output.push(`<blockquote>${renderMarkdown(body.join("\n"))}</blockquote>`);
			continue;
		}

		if (BULLET.test(line)) {
			index = collectList(lines, index, BULLET, "ul", output);
			continue;
		}

		if (NUMBERED.test(line)) {
			index = collectList(lines, index, NUMBERED, "ol", output);
			continue;
		}

		// Every block above consumed its line and continued, so this one cannot be
		// empty — but a `do` loop makes the guarantee structural rather than a
		// property of the checks above it staying in sync.
		const body: string[] = [];
		do {
			body.push(lines[index]);
			index += 1;
		} while (index < lines.length && lines[index].trim() && !startsBlock(lines[index]));
		output.push(`<p>${inline(body.join("\n"))}</p>`);
	}

	return output.join("\n");
}

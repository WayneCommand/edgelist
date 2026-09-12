import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown, safeHref } from "./markdown";

describe("escapeHtml", () => {
	it("neutralises every character that could open a tag or an attribute", () => {
		expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
		expect(escapeHtml("a & b")).toBe("a &amp; b");
		expect(escapeHtml("it's")).toBe("it&#39;s");
	});
});

describe("safeHref", () => {
	it("keeps targets a browser may follow", () => {
		expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
		expect(safeHref("http://example.com")).toBe("http://example.com");
		expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
		expect(safeHref("/waynecos/docs")).toBe("/waynecos/docs");
		expect(safeHref("#section")).toBe("#section");
	});

	it("refuses a scheme that runs code", () => {
		expect(safeHref("javascript:alert(1)")).toBeNull();
		expect(safeHref("JavaScript:alert(1)")).toBeNull();
		expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
		expect(safeHref("vbscript:msgbox(1)")).toBeNull();
	});
});

describe("renderMarkdown", () => {
	it("renders headings at the level the hashes ask for", () => {
		expect(renderMarkdown("# One")).toBe("<h1>One</h1>");
		expect(renderMarkdown("### Three")).toBe("<h3>Three</h3>");
		expect(renderMarkdown("####### Seven")).toBe("<p>####### Seven</p>");
	});

	it("joins consecutive lines into one paragraph", () => {
		expect(renderMarkdown("first\nsecond")).toBe("<p>first\nsecond</p>");
	});

	it("splits paragraphs on a blank line", () => {
		expect(renderMarkdown("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
	});

	it("renders emphasis, code and strikethrough", () => {
		expect(renderMarkdown("**bold**")).toBe("<p><strong>bold</strong></p>");
		expect(renderMarkdown("__bold__")).toBe("<p><strong>bold</strong></p>");
		expect(renderMarkdown("*italic*")).toBe("<p><em>italic</em></p>");
		expect(renderMarkdown("_italic_")).toBe("<p><em>italic</em></p>");
		expect(renderMarkdown("~~gone~~")).toBe("<p><del>gone</del></p>");
		expect(renderMarkdown("`code`")).toBe("<p><code>code</code></p>");
	});

	it("keeps markup inside a code span literal", () => {
		expect(renderMarkdown("`**not bold**`")).toBe("<p><code>**not bold**</code></p>");
	});

	it("renders a link", () => {
		expect(renderMarkdown("[docs](https://example.com)")).toBe(
			'<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a></p>',
		);
	});

	it("drops the target of a dangerous link but keeps its label", () => {
		const html = renderMarkdown("[click](javascript:alert(1))");
		expect(html).toBe("<p>click</p>");
		expect(html).not.toContain("href");
	});

	it("keeps a target whose path has parentheses", () => {
		// Stopping at the first `)` would leave the rest of the URL as stray text.
		expect(renderMarkdown("[wiki](https://en.wikipedia.org/wiki/A_(b))")).toBe(
			'<p><a href="https://en.wikipedia.org/wiki/A_(b)" target="_blank" rel="noopener noreferrer">wiki</a></p>',
		);
	});

	it("renders a fenced code block with its language", () => {
		expect(renderMarkdown("```ts\nconst a = 1;\n```")).toBe('<pre><code class="language-ts">const a = 1;</code></pre>');
	});

	it("does not let a code block's own content close it early", () => {
		const html = renderMarkdown("```\na\n```js\nb\n```");
		expect(html).toBe("<pre><code>a\n```js\nb</code></pre>");
	});

	it("runs an unterminated fence to the end of the file", () => {
		expect(renderMarkdown("```\nstill code")).toBe("<pre><code>still code</code></pre>");
	});

	it("renders unordered and ordered lists", () => {
		expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
		expect(renderMarkdown("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
		expect(renderMarkdown("* one\n* two")).toBe("<ul><li>one</li><li>two</li></ul>");
	});

	it("ends a list at the first line that is not an item", () => {
		expect(renderMarkdown("- one\nafter")).toBe("<ul><li>one</li></ul>\n<p>after</p>");
	});

	it("renders a blockquote", () => {
		expect(renderMarkdown("> quoted")).toBe("<blockquote><p>quoted</p></blockquote>");
	});

	it("renders a horizontal rule", () => {
		expect(renderMarkdown("---")).toBe("<hr />");
		expect(renderMarkdown("***")).toBe("<hr />");
	});

	it("returns nothing for an empty document", () => {
		expect(renderMarkdown("")).toBe("");
		expect(renderMarkdown("\n\n")).toBe("");
	});

	it("normalises CRLF line endings", () => {
		expect(renderMarkdown("# One\r\n\r\ntwo")).toBe("<h1>One</h1>\n<p>two</p>");
	});

	it("escapes HTML in the source instead of passing it through", () => {
		const html = renderMarkdown('<img src=x onerror="alert(1)">');
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});

	it("cannot be tricked into emitting a tag through emphasis or a heading", () => {
		expect(renderMarkdown("# <script>alert(1)</script>")).toBe("<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>");
		expect(renderMarkdown("**<b>x</b>**")).toBe("<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>");
		expect(renderMarkdown("```\n<script>alert(1)</script>\n```")).toBe(
			"<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>",
		);
	});

	it("terminates on a document that mixes every block type", () => {
		// The paragraph branch consumes at least one line by construction, so a
		// block that reaches it can never stall the outer loop.
		const html = renderMarkdown("# H\n\ntext\n\n- a\n- b\n\n> q\n\n---\n\n```\ncode\n```\n\nend");
		expect(html).toContain("<h1>H</h1>");
		expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
		expect(html).toContain("<blockquote><p>q</p></blockquote>");
		expect(html).toContain("<hr />");
		expect(html).toContain("<pre><code>code</code></pre>");
		expect(html).toContain("<p>end</p>");
	});
});

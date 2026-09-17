import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FileItem } from "../../lib/types";
import { DirectoryReadme } from "./DirectoryReadme";

/**
 * Render smoke tests for the directory readme.
 *
 * Only the text that is already in hand can be asserted here — a source that
 * needs a fetch resolves after effects, which `renderToStaticMarkup` never runs.
 * That path is covered in the browser instead.
 */

function entry(name: string, isDir = false): FileItem {
	return { name, size: 100, is_dir: isDir, modified: "2026-01-02T03:04:05Z", path: `/waynecos/${name}` };
}

function render(slot: "header" | "readme", items: FileItem[], metaValue?: string) {
	return renderToStaticMarkup(<DirectoryReadme slot={slot} items={items} metaValue={metaValue} />);
}

describe("DirectoryReadme", () => {
	it("renders nothing when the directory has neither a file nor a rule", () => {
		expect(render("readme", [], undefined)).toBe("");
	});

	it("renders a rule's markdown as real markup", () => {
		const html = render("readme", [], "# Welcome\n\nSome **text**.");
		expect(html).toContain("<h1>Welcome</h1>");
		expect(html).toContain("<strong>text</strong>");
		expect(html).not.toContain("**text**");
	});

	it("escapes markup that the rule contains", () => {
		const html = render("header", [], "<img src=x onerror=alert(1)>");
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});

	it("does not render the rule's text when a file in the directory wins", () => {
		expect(render("readme", [entry("readme.md")], "# from the rule")).toBe("");
	});

	it("picks the slot's own candidate names", () => {
		expect(render("readme", [entry("footer.md")], "")).toBe("");
		expect(render("header", [entry("index.md")], "")).toBe("");
		// A name from the other slot is not a source at all, so the rule shows.
		expect(render("readme", [entry("header.md")], "# rule")).toContain("<h1>rule</h1>");
	});

	it("wears the same card as the listing, not a surface of its own", () => {
		const html = render("readme", [], "# Welcome");
		// HeroUI's `card` class is where the panel radius and the shadow live. The
		// readme sits directly above and below the file list, so a hand-written
		// surface here would put two different corner radii side by side.
		expect(html).toContain("card--default");
		expect(html).not.toContain("border-border");
		// The rendered markup still gets the markdown styles, on its own element.
		expect(html).toContain("markdown-body");
	});
});

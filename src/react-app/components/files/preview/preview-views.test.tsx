import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FileItem } from "../../../lib/types";
import { MarkdownViewer } from "./MarkdownViewer";
import { PreviewBody } from "./index";

/**
 * Render smoke tests for the previewers, through `react-dom/server`.
 *
 * The editor branch is deliberately absent: it renders Monaco, which is loaded
 * lazily and has no server-side story. Everything else — the dispatch itself and
 * every viewer that is plain markup — is covered here, and the editor path is
 * covered in the browser instead.
 */

const noop = () => {};

const actions = { dirty: false, saving: false, onChange: noop, onSave: noop, onDownload: noop };

function file(name: string, size = 2048): FileItem {
	return { name, size, is_dir: false, modified: "2026-01-02T03:04:05Z", path: `/waynecos/${name}` };
}

function body(name: string, extra: { text?: string; url?: string } = {}) {
	const item = file(name);
	return renderToStaticMarkup(<PreviewBody source={{ item, kind: kindOf(name), ...extra }} {...actions} />);
}

// Kept local so the test states the extension it means rather than importing the
// table it is checking.
function kindOf(name: string) {
	const extension = name.split(".").pop() ?? "";
	if (["png", "jpg", "svg"].includes(extension)) return "image" as const;
	if (["mp4"].includes(extension)) return "video" as const;
	if (["mp3"].includes(extension)) return "audio" as const;
	if (extension === "pdf") return "pdf" as const;
	if (extension === "docx") return "office" as const;
	return "text" as const;
}

describe("preview dispatch", () => {
	it("renders an image from the object URL", () => {
		const html = body("photo.png", { url: "blob:mock-1" });
		expect(html).toContain("<img");
		expect(html).toContain('src="blob:mock-1"');
		expect(html).toContain('alt="photo.png"');
		expect(html).toContain("Image · 2.0 KB");
	});

	it("renders a video with controls and asks only for metadata", () => {
		const html = body("clip.mp4", { url: "blob:mock-2" });
		expect(html).toContain("<video");
		expect(html).toContain("controls");
		expect(html).toContain('preload="metadata"');
		expect(html).toContain("Video · 2.0 KB");
		// A black rectangle with no explanation is the worst answer to an .mkv.
		expect(html).toContain("Playback depends on the codecs");
	});

	it("renders audio without the codec note", () => {
		const html = body("song.mp3", { url: "blob:mock-3" });
		expect(html).toContain("<audio");
		expect(html).toContain("Audio · 2.0 KB");
		expect(html).not.toContain("Playback depends on the codecs");
	});

	it("renders a PDF in an iframe named after the file", () => {
		const html = body("paper.pdf", { url: "blob:mock-4" });
		expect(html).toContain("<iframe");
		expect(html).toContain('title="paper.pdf"');
		expect(html).toContain("PDF · 2.0 KB");
	});

	it("explains why an Office document has no preview", () => {
		const html = body("budget.docx");
		expect(html).toContain("No in-browser preview for .docx");
		expect(html).toContain("Open the file in a desktop application");
	});

	it("explains a file that is too large to hold in memory", () => {
		const item = { ...file("film.mp4", 500 * 1024 * 1024), path: "/waynecos/film.mp4" };
		const html = renderToStaticMarkup(<PreviewBody source={{ item, kind: "toolarge" }} {...actions} />);
		expect(html).toContain("Too large to preview here");
		expect(html).toContain("holds the whole file in memory");
		expect(html).not.toContain("<video");
	});

	it("offers a download for every binary preview", () => {
		for (const name of ["photo.png", "clip.mp4", "song.mp3", "paper.pdf", "budget.docx"]) {
			expect(body(name, { url: "blob:mock" })).toContain("Download");
		}
	});
});

/**
 * The viewers share one frame and one panel height (see `metrics.ts`). Stepping
 * through a folder used to resize the dialog on every file, because each viewer
 * had picked its own numbers; these assertions are what stops that coming back.
 */
describe("preview geometry", () => {
	const height = "h-[min(68vh,640px)]";

	it("gives a picture a ring so it cannot dissolve into the frame", () => {
		const html = body("photo.png", { url: "blob:mock-1" });
		// The ring is drawn inside the edge, so it must not be a border.
		expect(html).toContain("image-outline");
		expect(html).not.toContain("ring-");
	});

	it("sizes every panel-shaped viewer from the same height", () => {
		for (const [name, extra] of [
			["photo.png", { url: "blob:mock" }],
			["clip.mp4", { url: "blob:mock" }],
			["paper.pdf", { url: "blob:mock" }],
		] as const) {
			expect(body(name, extra)).toContain(height);
		}
	});

	it("does not force a panel height onto a control or a sentence", () => {
		// A 640px well around a 40px player, or around two lines of prose, is a
		// worse answer than a dialog the size of its contents.
		expect(body("song.mp3", { url: "blob:mock" })).not.toContain(height);
		expect(body("budget.docx")).not.toContain(height);
	});

	it("still gives the short viewers the shared frame", () => {
		for (const [name, extra] of [
			["song.mp3", { url: "blob:mock" }],
			["budget.docx", undefined],
		] as const) {
			expect(body(name, extra)).toContain("rounded-lg border border-border");
		}
	});
});

describe("markdown viewer", () => {
	function markdown(text: string, extra: { dirty?: boolean; saving?: boolean } = {}) {
		return renderToStaticMarkup(
			<MarkdownViewer
				item={file("notes.md", 512)}
				text={text}
				dirty={extra.dirty ?? false}
				saving={extra.saving ?? false}
				onChange={noop}
				onSave={noop}
			/>,
		);
	}

	it("opens rendered, with the source one click away", () => {
		const html = markdown("# Title");
		expect(html).toContain("<h1>Title</h1>");
		expect(html).toContain("Rendered");
		expect(html).toContain("Source");
		expect(html).toContain('aria-pressed="true"');
	});

	it("does not show a Save button until the source is being edited", () => {
		// Rendered output is not editable, so there is nothing to save from it.
		expect(markdown("# Title")).not.toContain(">Save<");
	});

	it("says so when the file is empty", () => {
		expect(markdown("")).toContain("This file is empty.");
	});

	it("renders the source as escaped text, never as markup", () => {
		const html = markdown("# <script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
	});

	it("reads prose on the page surface at the shared panel size", () => {
		const html = markdown("# Title");
		expect(html).toContain("bg-surface p-5");
		expect(html).toContain("h-[min(68vh,640px)]");
	});

	it("does not wrap the empty notice in a panel", () => {
		// One sentence should not claim 640 pixels of dialog.
		expect(markdown("")).not.toContain("h-[min(68vh,640px)]");
	});
});

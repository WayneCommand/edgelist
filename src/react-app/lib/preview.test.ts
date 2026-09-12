import { describe, expect, it } from "vitest";
import {
	BLOB_SIZE_LIMIT,
	EDITOR_SIZE_LIMIT,
	isPreviewable,
	mimeFor,
	needsText,
	previewCaption,
	previewKindFor,
	previewLimitFor,
	previewNotice,
	withMime,
} from "./preview";

describe("previewKindFor", () => {
	it("routes each media family to its own previewer", () => {
		expect(previewKindFor("photo.png")).toBe("image");
		expect(previewKindFor("clip.mp4")).toBe("video");
		expect(previewKindFor("song.mp3")).toBe("audio");
		expect(previewKindFor("paper.pdf")).toBe("pdf");
		expect(previewKindFor("notes.md")).toBe("markdown");
		expect(previewKindFor("config.yaml")).toBe("text");
		expect(previewKindFor("budget.xlsx")).toBe("office");
	});

	it("ignores case in the extension", () => {
		expect(previewKindFor("PHOTO.PNG")).toBe("image");
		expect(previewKindFor("Notes.MD")).toBe("markdown");
	});

	it("treats an SVG as a picture even though it is also text", () => {
		// The old extension map knew `svg` as XML, so it opened in the editor. A
		// file manager shows the picture.
		expect(previewKindFor("logo.svg")).toBe("image");
	});

	it("falls back to the editor for formats it has no viewer for", () => {
		expect(previewKindFor("script.sh")).toBe("text");
		expect(previewKindFor("query.sql")).toBe("text");
		expect(previewKindFor(".env")).toBe("text");
	});

	it("leaves anything unrecognised to the download path", () => {
		expect(previewKindFor("archive.zip")).toBe("none");
		expect(previewKindFor("binary")).toBe("none");
	});

	it("does not read a bare name as an extension", () => {
		// `split(".").pop()` returned the whole name, so a file called `png` was an
		// image and a file called `json` opened in the JSON editor.
		expect(previewKindFor("png")).toBe("none");
		expect(previewKindFor("json")).toBe("none");
		expect(previewKindFor("Makefile")).toBe("none");
	});

	it("only looks at the last extension", () => {
		expect(previewKindFor("backup.tar.gz")).toBe("none");
	});
});

describe("isPreviewable", () => {
	it("counts an Office document as previewable", () => {
		// It opens a panel that explains why there is nothing to show, which beats
		// downloading on a double click with no explanation.
		expect(isPreviewable("report.docx")).toBe(true);
		expect(isPreviewable("archive.zip")).toBe(false);
	});
});

describe("needsText", () => {
	it("separates the kinds that read the file as text from the ones that read bytes", () => {
		expect(needsText("text")).toBe(true);
		expect(needsText("markdown")).toBe(true);
		expect(needsText("image")).toBe(false);
		expect(needsText("pdf")).toBe(false);
		expect(needsText("office")).toBe(false);
	});
});

describe("previewLimitFor", () => {
	it("caps the kinds that go through the editor", () => {
		expect(previewLimitFor("huge.txt", EDITOR_SIZE_LIMIT + 1)).toBe(EDITOR_SIZE_LIMIT);
		expect(previewLimitFor("huge.txt", EDITOR_SIZE_LIMIT)).toBeNull();
	});

	it("caps the kinds that are buffered as a blob", () => {
		// A blob is complete before the media element sees it, so `preload` cannot
		// save a file this size from being held in memory in full.
		expect(previewLimitFor("film.mp4", BLOB_SIZE_LIMIT + 1)).toBe(BLOB_SIZE_LIMIT);
		expect(previewLimitFor("song.mp3", BLOB_SIZE_LIMIT + 1)).toBe(BLOB_SIZE_LIMIT);
		expect(previewLimitFor("photo.png", BLOB_SIZE_LIMIT + 1)).toBe(BLOB_SIZE_LIMIT);
		expect(previewLimitFor("paper.pdf", BLOB_SIZE_LIMIT + 1)).toBe(BLOB_SIZE_LIMIT);
		expect(previewLimitFor("film.mp4", BLOB_SIZE_LIMIT)).toBeNull();
	});

	it("allows a blob format to be much larger than a text one", () => {
		const size = 8 * 1024 * 1024;
		expect(previewLimitFor("clip.mp4", size)).toBeNull();
		expect(previewLimitFor("notes.txt", size)).toBe(EDITOR_SIZE_LIMIT);
	});

	it("has no limit for a format that is never fetched", () => {
		expect(previewLimitFor("archive.zip", 5 * 1024 * 1024 * 1024)).toBeNull();
		expect(previewLimitFor("report.docx", 5 * 1024 * 1024 * 1024)).toBeNull();
	});
});

describe("previewKindFor with a size", () => {
	it("resolves an oversized file to the panel rather than a previewer", () => {
		expect(previewKindFor("film.mp4", BLOB_SIZE_LIMIT + 1)).toBe("toolarge");
		expect(previewKindFor("huge.txt", EDITOR_SIZE_LIMIT + 1)).toBe("toolarge");
		expect(previewKindFor("film.mp4", BLOB_SIZE_LIMIT)).toBe("video");
	});

	it("leaves the size out of it when no size is given", () => {
		// Callers that only know the name — a list of extensions, say — still get
		// the extension's answer.
		expect(previewKindFor("film.mp4")).toBe("video");
		expect(previewKindFor("huge.txt")).toBe("text");
	});

	it("keeps an oversized file previewable, because the panel is a preview", () => {
		expect(isPreviewable("film.mp4", BLOB_SIZE_LIMIT + 1)).toBe(true);
		expect(isPreviewable("archive.zip", 5 * 1024 * 1024 * 1024)).toBe(false);
	});
});

describe("previewNotice", () => {
	it("names the missing renderer for an Office document", () => {
		const notice = previewNotice("office", "budget.xlsx");
		expect(notice.title).toBe("No in-browser preview for .xlsx");
		expect(notice.body).toContain("converter this app does not ship");
	});

	it("explains the buffering ceiling without offering a download", () => {
		// Downloading is not a fallback this step relies on, so the copy does not
		// promise one.
		const notice = previewNotice("toolarge", "film.mp4");
		expect(notice.title).toBe("Too large to preview here");
		expect(notice.body).toContain("holds the whole file in memory");
		expect(notice.body).not.toContain("Download");
	});
});

describe("mimeFor", () => {
	it("knows the types a media element needs", () => {
		expect(mimeFor("a.png")).toBe("image/png");
		expect(mimeFor("a.jpg")).toBe("image/jpeg");
		expect(mimeFor("a.mp4")).toBe("video/mp4");
		expect(mimeFor("a.mp3")).toBe("audio/mpeg");
		expect(mimeFor("a.pdf")).toBe("application/pdf");
	});

	it("has no answer for formats it does not play", () => {
		expect(mimeFor("a.zip")).toBeNull();
		expect(mimeFor("a.txt")).toBeNull();
	});
});

describe("withMime", () => {
	it("retypes a blob the driver left generic", () => {
		const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" });
		expect(withMime(blob, "clip.mp4").type).toBe("video/mp4");
	});

	it("retypes a blob with no type at all", () => {
		const blob = new Blob([new Uint8Array([1])], { type: "" });
		expect(withMime(blob, "photo.png").type).toBe("image/png");
	});

	it("keeps what the driver reported when it reported something specific", () => {
		// An S3 object stored with a real Content-Type is a better authority than
		// the extension.
		const blob = new Blob([new Uint8Array([1])], { type: "image/avif" });
		expect(withMime(blob, "photo.png").type).toBe("image/avif");
	});

	it("leaves a format it has no type for untouched", () => {
		const blob = new Blob([new Uint8Array([1])], { type: "application/octet-stream" });
		expect(withMime(blob, "notes.txt").type).toBe("application/octet-stream");
	});

	it("preserves the bytes", () => {
		const blob = new Blob([new Uint8Array([7, 8, 9])], { type: "" });
		expect(withMime(blob, "a.png").size).toBe(3);
	});
});

describe("previewCaption", () => {
	it("names the language for text and the family for everything else", () => {
		expect(previewCaption("text", "query.sql", 2048)).toBe("SQL · 2.0 KB");
		expect(previewCaption("markdown", "notes.md", 512)).toBe("Markdown · 512 B");
		expect(previewCaption("pdf", "paper.pdf", 1024 * 1024)).toBe("PDF · 1.0 MB");
		expect(previewCaption("office", "budget.xlsx", 0)).toBe("Office document · 0 B");
	});
});

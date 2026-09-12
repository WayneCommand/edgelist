import { extensionOf, formatSize, languageForFile } from "./format";
import type { MessageKey, Translate } from "./i18n";

/**
 * How a file is shown when it is opened.
 *
 * The extension decides, and nothing else: a listing carries no media type (the
 * worker passes through whatever the driver reported, and S3 and WebDAV both
 * leave it empty), and sniffing the bytes would mean downloading the file just
 * to find out how to show it.
 *
 * `toolarge` is the exception — it comes from the file's size, not its name.
 */
export type PreviewKind = "text" | "markdown" | "image" | "video" | "audio" | "pdf" | "office" | "toolarge" | "none";

const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkd"];
/**
 * `svg` is here on purpose even though it is also a text format. A file manager
 * shows an SVG as a picture; the XML is one "open in the editor" away, and the
 * image is what the file is for.
 */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "ogv", "mov", "m4v", "mkv"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac", "opus"];
const PDF_EXTENSIONS = ["pdf"];
/**
 * Formats no browser renders on its own. `.doc`/`.xls`/`.ppt` are the legacy
 * binary ones; even the OOXML trio needs a renderer bundle larger than this
 * app's whole frontend, so the previewer says so instead of failing quietly.
 */
const OFFICE_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"];

const KIND_BY_EXTENSION: Record<string, PreviewKind> = {};
for (const [kind, extensions] of [
	["markdown", MARKDOWN_EXTENSIONS],
	["image", IMAGE_EXTENSIONS],
	["video", VIDEO_EXTENSIONS],
	["audio", AUDIO_EXTENSIONS],
	["pdf", PDF_EXTENSIONS],
	["office", OFFICE_EXTENSIONS],
] as const) {
	for (const extension of extensions) KIND_BY_EXTENSION[extension] = kind;
}

const MIME_BY_EXTENSION: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	avif: "image/avif",
	mp4: "video/mp4",
	webm: "video/webm",
	ogv: "video/ogg",
	mov: "video/quicktime",
	m4v: "video/x-m4v",
	mkv: "video/x-matroska",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	m4a: "audio/mp4",
	flac: "audio/flac",
	aac: "audio/aac",
	opus: "audio/ogg",
	pdf: "application/pdf",
};

const CAPTION_KEY_BY_KIND: Record<PreviewKind, MessageKey> = {
	text: "preview.caption.text",
	markdown: "preview.caption.markdown",
	image: "preview.caption.image",
	video: "preview.caption.video",
	audio: "preview.caption.audio",
	pdf: "preview.caption.pdf",
	office: "preview.caption.office",
	toolarge: "preview.caption.file",
	none: "preview.caption.file",
};

/**
 * Monaco keeps the whole file in memory as a single string and the bytes arrive
 * in one fetch, so there is a real ceiling on what can be opened in the editor.
 */
export const EDITOR_SIZE_LIMIT = 2 * 1024 * 1024;

/**
 * The byte-based previewers work from an object URL, which means the whole file
 * is in memory before anything appears on screen. `<video preload="metadata">`
 * does not buy anything here: by the time the element sees the blob, the blob is
 * already complete — a 50 MB recording took half a minute to appear when this
 * was measured against a real bucket.
 *
 * Showing a large video without buffering it first needs `/d/*` to be fetchable
 * by a media element, and that route is authenticated by header (see
 * `fetchFileResponse`). Until that changes, a file past this size gets an
 * explanation rather than a spinner.
 */
export const BLOB_SIZE_LIMIT = 16 * 1024 * 1024;

/** Which previewer a name gets, from its extension alone. */
function baseKindFor(name: string): PreviewKind {
	const known = KIND_BY_EXTENSION[extensionOf(name)];
	if (known) return known;
	return languageForFile(name) ? "text" : "none";
}

/**
 * The size past which this file's previewer cannot cope, or `null` when it can
 * handle any size. A format with no previewer at all has no limit — nothing is
 * ever fetched for it.
 */
export function previewLimitFor(name: string, size: number): number | null {
	const kind = baseKindFor(name);
	if (needsText(kind)) return size > EDITOR_SIZE_LIMIT ? EDITOR_SIZE_LIMIT : null;
	if (kind === "none" || kind === "office") return null;
	return size > BLOB_SIZE_LIMIT ? BLOB_SIZE_LIMIT : null;
}

/**
 * Which previewer a file gets. Pass the size and an oversized file resolves to
 * `toolarge`, which is a panel rather than a previewer.
 */
export function previewKindFor(name: string, size?: number): PreviewKind {
	const kind = baseKindFor(name);
	if (size === undefined) return kind;
	return previewLimitFor(name, size) === null ? kind : "toolarge";
}

/** Whether opening this shows something at all, as opposed to downloading it. */
export function isPreviewable(name: string, size?: number): boolean {
	return previewKindFor(name, size) !== "none";
}

/** Kinds whose previewer needs the file's bytes as text rather than as a blob. */
export function needsText(kind: PreviewKind): boolean {
	return kind === "text" || kind === "markdown";
}

export type PreviewNotice = { title: string; body: string };

/**
 * What a panel says about a file that has no previewer, and why.
 *
 * The translator is a parameter rather than the module-level one in
 * `lib/locale.ts`, and that is the one place in `lib/` where it is: this
 * function's only caller renders its result directly, so it has a translator to
 * hand and taking it keeps this module free of state that a test would have to
 * arrange. `previewCaption` follows the same rule for the same reason.
 */
export function previewNotice(kind: PreviewKind, name: string, t: Translate): PreviewNotice {
	if (kind === "office") {
		const extension = extensionOf(name);
		return {
			// `office` is only ever reached through a known extension, so the
			// generic form is a guard rather than a case that happens.
			title: extension ? t("preview.officeTitle", { extension: `.${extension}` }) : t("preview.officeTitleGeneric"),
			body: t("preview.officeBody"),
		};
	}
	return { title: t("preview.tooLargeTitle"), body: t("preview.tooLargeBody") };
}

/** Media type for a name, used only when the response did not supply one. */
export function mimeFor(name: string): string | null {
	return MIME_BY_EXTENSION[extensionOf(name)] ?? null;
}

/**
 * Gives a blob the media type its extension implies, but only when the response
 * was silent. A driver that does not know a file's type answers
 * `application/octet-stream`, and a `<video>` refuses to play a blob carrying
 * that type — while a driver that *does* know (an S3 object stored with a
 * `Content-Type`) is the better authority, so its answer is left alone.
 */
export function withMime(blob: Blob, name: string): Blob {
	const type = mimeFor(name);
	if (!type || (blob.type && blob.type !== "application/octet-stream")) return blob;
	return blob.slice(0, blob.size, type);
}

/** One-line description of the file being shown, e.g. `PDF · 1.2 MB`. */
export function previewCaption(kind: PreviewKind, name: string, size: number, t: Translate): string {
	// A text file is labelled with its own language — `SQL`, `PYTHON` — which is
	// a proper noun and is never translated; the catalogue's `Text` is only the
	// answer for a text kind whose language could not be determined.
	const label =
		kind === "text" ? (languageForFile(name) ?? t("preview.caption.text")).toUpperCase() : t(CAPTION_KEY_BY_KIND[kind]);
	return `${label} · ${formatSize(size)}`;
}

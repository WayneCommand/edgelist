/**
 * Sizes, dates, and what kind of thing a file is.
 *
 * Every rule here is the spec's, quoted where it is not obvious:
 *
 * - **Size** (§4.2): under 1K shows whole bytes with a `B` suffix; otherwise two
 *   decimals with `K`/`M`/`G`/`T`; zero or absent shows `-`.
 * - **Date** (§4.2): `YYYY-MM-DD HH:mm:ss` in local time, every field padded.
 * - **Kind**: the extension, and nothing else. A listing carries no media type —
 *   the Worker passes through whatever the driver reported, and S3 and WebDAV both
 *   leave it empty — and sniffing bytes would mean downloading the file to find
 *   out how to show it.
 */

const SIZE_UNITS = ["B", "K", "M", "G", "T", "P", "E"] as const;

/**
 * A file size, for the client.
 *
 * Two decimals above 1K rather than one: `1.20K` is what §4.2 spells, and it is
 * the format that keeps a column of sizes the same width.
 */
export function formatSize(size: number | undefined | null): string {
	if (size === undefined || size === null || size <= 0) return "-";
	if (size < 1024) return `${Math.trunc(size)}B`;
	let value = size / 1024;
	let unit = 1;
	while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(2)}${SIZE_UNITS[unit]}`;
}

/**
 * The same scale for a *resolved* byte total, as filenames and totals want it.
 *
 * `4.00KB` rather than §4.2's `4.00K`: this form is used where a reader is
 * comparing a number against a file size they know, so the unit is spelled out.
 * Both exist because the spec asks for the short form in the size column and the
 * long one in prose.
 */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
	if (bytes < 1024) return `${Math.trunc(bytes)} B`;
	const units = ["KB", "MB", "GB", "TB", "PB", "EB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(2)} ${units[unit]}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * `YYYY-MM-DD HH:mm:ss`, local time.
 *
 * The parse is explicit rather than left to `toLocaleString`: the spec fixes one
 * format for the whole interface, and a locale-aware date would render differently
 * in two browsers viewing the same listing.
 */
export function formatDate(value: string | undefined | null): string {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	// The Worker writes the epoch when a storage reports no timestamp — a directory
	// synthesized from a key prefix, an object with no `LastModified`. Rendering that is
	// worse than rendering nothing: "1970-01-01 08:00:00" reads as a fact about the file
	// rather than as the absence of one, and no real file in this system predates 1970 by
	// enough to be the same value.
	if (date.getTime() <= 0) return "-";
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	);
}

/**
 * A lowercased extension without the dot, or `""` when there is none.
 *
 * The last dot decides, and only when it is not the first character: `.env` is a
 * file called `.env`, not a file with the extension `env`, and a name with no dot
 * has no extension at all — the naive `split(".").pop()` reports a file called
 * `png` as a PNG image.
 */
export function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return "";
	return name.slice(dot + 1).toLowerCase();
}

/* ------------------------------------------------------------------- kinds */

/**
 * What a name opens as.
 *
 * `archive` and `office` are recognised so the interface can explain itself;
 * neither has a renderer here (`Interfaces` §5.13 and §5.11 describe previewers
 * that need libraries this app does not ship).
 */
export type FileKind =
	| "directory"
	| "markdown"
	| "text"
	| "image"
	| "video"
	| "audio"
	| "pdf"
	| "html"
	| "archive"
	| "office"
	| "url"
	| "binary";

const MARKDOWN = new Set(["md", "markdown", "mdown", "mkd"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO = new Set(["mp4", "webm", "ogv", "mov", "m4v", "mkv"]);
const AUDIO = new Set(["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac", "opus"]);
const PDF = new Set(["pdf"]);
const HTML = new Set(["html", "htm"]);
const ARCHIVE = new Set(["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst", "iso"]);
const OFFICE = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);
const URL_FILE = new Set(["url"]);

/**
 * Extensions the editor opens as text even though they are not in the language
 * table below: a config file with no extension of its own is still text.
 */
const TEXTUAL = new Set([
	"txt",
	"log",
	"csv",
	"tsv",
	"yaml",
	"yml",
	"json",
	"jsonc",
	"json5",
	"toml",
	"ini",
	"conf",
	"cfg",
	"env",
	"js",
	"mjs",
	"cjs",
	"jsx",
	"ts",
	"tsx",
	"css",
	"scss",
	"less",
	"sh",
	"bash",
	"zsh",
	"fish",
	"py",
	"rb",
	"go",
	"rs",
	"java",
	"kt",
	"c",
	"h",
	"cpp",
	"hpp",
	"cs",
	"php",
	"sql",
	"xml",
	"svg",
	"graphql",
	"proto",
	"dockerfile",
	"makefile",
	"gitignore",
	"editorconfig",
	"lock",
]);

/** Which previewer a name gets. The extension decides, and nothing else. */
export function kindOf(name: string, isDirectory = false): FileKind {
	if (isDirectory) return "directory";
	const extension = extensionOf(name);
	if (MARKDOWN.has(extension)) return "markdown";
	// An SVG is both a picture and XML, and IMAGE wins: a file manager shows it
	// as a picture, and the source is one "open in the editor" away.
	if (IMAGE.has(extension)) return "image";
	if (VIDEO.has(extension)) return "video";
	if (AUDIO.has(extension)) return "audio";
	if (PDF.has(extension)) return "pdf";
	if (HTML.has(extension)) return "html";
	if (ARCHIVE.has(extension)) return "archive";
	if (OFFICE.has(extension)) return "office";
	if (URL_FILE.has(extension)) return "url";
	if (TEXTUAL.has(extension)) return "text";
	return "binary";
}

/** Whether a kind is rendered as text rather than as bytes. */
export function isTextKind(kind: FileKind): boolean {
	return kind === "text" || kind === "markdown" || kind === "html";
}

/** The media type for a name, used when a response did not supply one. */
const MIME: Record<string, string> = {
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

export function mimeFor(name: string): string | null {
	return MIME[extensionOf(name)] ?? null;
}

/**
 * Gives a blob the type its extension implies, but only when the response was
 * silent.
 *
 * A driver that does not know a file's type answers `application/octet-stream`,
 * and a `<video>` refuses to play a blob carrying that type. A driver that *does*
 * know — an S3 object stored with a `Content-Type` — is the better authority, so
 * its answer is left alone.
 */
export function withMime(blob: Blob, name: string): Blob {
	const type = mimeFor(name);
	if (!type || (blob.type && blob.type !== "application/octet-stream")) return blob;
	return blob.slice(0, blob.size, type);
}

/** The Monaco language id for a name, or a plain-text fallback. */
const LANGUAGES: Record<string, string> = {
	txt: "plaintext",
	log: "plaintext",
	md: "markdown",
	markdown: "markdown",
	mdown: "markdown",
	mkd: "markdown",
	yaml: "yaml",
	yml: "yaml",
	json: "json",
	jsonc: "json",
	json5: "json",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "javascript",
	ts: "typescript",
	tsx: "typescript",
	css: "css",
	scss: "scss",
	less: "less",
	html: "html",
	htm: "html",
	xml: "xml",
	svg: "xml",
	toml: "ini",
	ini: "ini",
	conf: "ini",
	cfg: "ini",
	env: "ini",
	sh: "shell",
	bash: "shell",
	zsh: "shell",
	fish: "shell",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	c: "c",
	h: "c",
	cpp: "cpp",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	sql: "sql",
	graphql: "graphql",
	proto: "protobuf",
	csv: "plaintext",
	tsv: "plaintext",
};

export function languageFor(name: string): string {
	return LANGUAGES[extensionOf(name)] ?? "plaintext";
}

/**
 * The icons a name maps to.
 *
 * One table for the file glyph and the preview thumbnail, so a `.zip` cannot be a
 * box in the list and a page in the grid.
 */
export function iconFor(
	kind: FileKind,
):
	| "folder"
	| "file-archive"
	| "file-audio"
	| "file-code"
	| "file-image"
	| "file-pdf"
	| "file-text"
	| "file-video"
	| "file" {
	switch (kind) {
		case "directory":
			return "folder";
		case "archive":
			return "file-archive";
		case "audio":
			return "file-audio";
		case "image":
			return "file-image";
		case "pdf":
			return "file-pdf";
		case "video":
			return "file-video";
		case "markdown":
		case "text":
		case "html":
		case "url":
			return "file-text";
		case "office":
			return "file";
		default:
			return "file";
	}
}

/** `0.4` → `40%`, clamped, for progress readouts. */
export function percentOf(done: number, total: number): number {
	if (!Number.isFinite(total) || total <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

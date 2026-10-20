/**
 * A file name's content type, for the routes that serve bytes.
 *
 * The client has a table of its own (`lib/format.ts`) because a blob with an
 * `application/octet-stream` type will not play in a `<video>`. This one exists
 * for the *server* side of the same problem: a direct link is opened by whatever
 * the visitor has — a browser tab, a media player, an image tag in someone else's
 * page — and each of those decides what to do with a response from its
 * `Content-Type`. Answering `application/octet-stream` for a `.png` makes the
 * link a download in every one of them.
 *
 * The list is deliberately short: it covers what a link is plausibly used for and
 * nothing more. An unknown extension is `application/octet-stream`, which is the
 * honest answer — and the safe one, since a type guessed wrong is worse than a
 * type left vague.
 */

const TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
	avif: "image/avif",
	ico: "image/x-icon",
	svg: "image/svg+xml",
	mp4: "video/mp4",
	webm: "video/webm",
	ogv: "video/ogg",
	mov: "video/quicktime",
	m4v: "video/x-m4v",
	mkv: "video/x-matroska",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	flac: "audio/flac",
	aac: "audio/aac",
	m4a: "audio/mp4",
	opus: "audio/ogg",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	pdf: "application/pdf",
	json: "application/json",
	txt: "text/plain; charset=utf-8",
	log: "text/plain; charset=utf-8",
	md: "text/markdown; charset=utf-8",
	markdown: "text/markdown; charset=utf-8",
	csv: "text/csv; charset=utf-8",
	xml: "application/xml",
	zip: "application/zip",
	gz: "application/gzip",
	tar: "application/x-tar",
	"7z": "application/x-7z-compressed",
	// Source code is text, and a link to a `.js` or `.json` file is useful to read
	// in a tab. Without these the file downloads as an unnamed binary, which is
	// the one outcome a share should never produce for a text file.
	js: "text/javascript; charset=utf-8",
	mjs: "text/javascript; charset=utf-8",
	cjs: "text/javascript; charset=utf-8",
	ts: "text/plain; charset=utf-8",
	tsx: "text/plain; charset=utf-8",
	jsx: "text/plain; charset=utf-8",
	css: "text/css; charset=utf-8",
	html: "text/html; charset=utf-8",
	htm: "text/html; charset=utf-8",
	yml: "text/yaml; charset=utf-8",
	yaml: "text/yaml; charset=utf-8",
	toml: "text/plain; charset=utf-8",
	ini: "text/plain; charset=utf-8",
	conf: "text/plain; charset=utf-8",
	sh: "text/plain; charset=utf-8",
	py: "text/plain; charset=utf-8",
	go: "text/plain; charset=utf-8",
	rs: "text/plain; charset=utf-8",
	java: "text/plain; charset=utf-8",
	sql: "text/plain; charset=utf-8",
	env: "text/plain; charset=utf-8",
};

const FALLBACK = "application/octet-stream";

/** The type an extension implies, or `application/octet-stream`. */
export function contentTypeFor(name: string): string {
	const extension = name.split(".").pop()?.toLowerCase() ?? "";
	// A name with no dot returns the whole name here, so the lookup simply misses.
	return TYPES[extension] ?? FALLBACK;
}

/**
 * Whether a browser will render this type in a tab rather than download it.
 *
 * Only used to decide `Content-Disposition`: an image, a video or a PDF is nicer
 * to *see* through a link, while an archive or an unknown blob is nicer to
 * *save*. Either way the bytes are identical, so this is a presentation choice and
 * never a security boundary.
 */
export function isViewableType(type: string): boolean {
	// HTML is deliberately excluded, and is served as `attachment`: an inline page
	// on this origin would be a script the visitor's browser runs with the app's
	// own origin, which is an XSS the share owner never asked for. The bytes are
	// still served, just saved rather than rendered.
	if (type.startsWith("text/html")) return false;
	return type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/") || type.startsWith("text/")
		? true
		: type === "application/pdf" || type === "application/json" || type === "application/xml";
}

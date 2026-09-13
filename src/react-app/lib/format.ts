import type { Translate } from "./i18n";
import { isMountPoint } from "./mask";
import type { FileItem } from "./types";

export function formatSize(size: number) {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The glyph a listing shows for an entry.
 *
 * A mount point gets its own symbol rather than the folder glyph, because the
 * two behave differently: rename, move and remove are refused on a mount point
 * and allowed on a folder. An emoji is the only icon vocabulary this UI has, so
 * this is where that distinction has to live.
 */
export function fileGlyph(item: FileItem) {
	if (isMountPoint(item)) return "💾";
	return item.is_dir ? "📁" : "📄";
}

/**
 * The line of secondary text beside an entry's name.
 *
 * Shared so the table and the grid cannot drift apart on what a mount point is
 * called. `t` is passed in rather than read ambiently because both callers
 * already hold one from `useT()`.
 */
export function fileDescription(item: FileItem, t: Translate) {
	if (isMountPoint(item)) return t("table.mount");
	if (item.is_dir) return t("table.folder");
	return formatSize(item.size);
}

/**
 * Lowercase extension without the dot, or `""` when the name has none.
 *
 * A name with no dot has no extension: the old `split(".").pop()` returned the
 * whole name, so a file called `png` was treated as an image. A leading dot is
 * not a separator either, which keeps `.env` reading as `env`.
 */
export function extensionOf(name: string) {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function languageForFile(name: string) {
	const extension = extensionOf(name);
	const languages: Record<string, string> = {
		txt: "plaintext",
		md: "markdown",
		markdown: "markdown",
		yaml: "yaml",
		yml: "yaml",
		json: "json",
		js: "javascript",
		jsx: "javascript",
		ts: "typescript",
		tsx: "typescript",
		css: "css",
		html: "html",
		htm: "html",
		xml: "xml",
		toml: "ini",
		ini: "ini",
		conf: "ini",
		env: "ini",
		sh: "shell",
		bash: "shell",
		sql: "sql",
	};
	return languages[extension] ?? null;
}

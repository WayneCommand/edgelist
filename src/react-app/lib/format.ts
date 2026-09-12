export function formatSize(size: number) {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / 1024 / 1024).toFixed(1)} MB`;
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

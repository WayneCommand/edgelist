export function formatSize(size: number) { if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / 1024 / 1024).toFixed(1)} MB`; }

export function languageForFile(name: string) {
	const extension = name.toLowerCase().split(".").pop() ?? "";
	const languages: Record<string, string> = { txt: "plaintext", md: "markdown", markdown: "markdown", yaml: "yaml", yml: "yaml", json: "json", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", css: "css", html: "html", htm: "html", xml: "xml", toml: "ini", ini: "ini", conf: "ini", env: "ini", sh: "shell", bash: "shell", sql: "sql" };
	return languages[extension] ?? null;
}

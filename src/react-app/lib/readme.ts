import type { FileItem } from "./types";

/**
 * Where a directory's readme and header come from.
 *
 * OpenList looks for a file *in the directory* before it looks at the metadata
 * rule, and it accepts three names per slot. That is where a directory's "three
 * markdown files" come from: one of `header.md` / `top.md` / `index.md` above
 * the list, one of `readme.md` / `footer.md` / `bottom.md` below it. The second
 * group is why a `footer.md` never needs a field of its own.
 */
export const README_FILES: Record<ReadmeSlot, readonly string[]> = {
	header: ["header.md", "top.md", "index.md"],
	readme: ["readme.md", "footer.md", "bottom.md"],
};

export type ReadmeSlot = "header" | "readme";

/** What one slot should render, once the directory and the rule are known. */
export type ReadmeSource =
	| { kind: "file"; path: string }
	| { kind: "remote"; url: string }
	| { kind: "inline"; text: string }
	| { kind: "none" };

const REMOTE_PATTERN = /^https?:\/\//i;

/**
 * Picks the source for one slot. A file in the directory wins over the metadata
 * rule; a rule holding an `http(s)` URL is fetched rather than rendered, which
 * is how OpenList lets one rule point at a readme hosted elsewhere.
 */
export function readmeSourceFor(slot: ReadmeSlot, items: FileItem[], metaValue?: string): ReadmeSource {
	const names = README_FILES[slot];
	const file = items.find((item) => !item.is_dir && names.includes(item.name.toLowerCase()));
	if (file) return { kind: "file", path: file.path };

	const value = metaValue?.trim();
	if (!value) return { kind: "none" };
	if (REMOTE_PATTERN.test(value)) return { kind: "remote", url: value };
	return { kind: "inline", text: value };
}

/** A stable identity for a source, so an effect can re-run only when it changes. */
export function readmeSourceKey(source: ReadmeSource): string {
	if (source.kind === "file") return `file:${source.path}`;
	if (source.kind === "remote") return `remote:${source.url}`;
	if (source.kind === "inline") return `inline:${source.text}`;
	return "none";
}

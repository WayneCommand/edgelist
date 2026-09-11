/** Path helpers shared by the file views. */

/** The directory that holds `path`; the root's parent is the root itself. */
export function parentOf(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut <= 0 ? "/" : path.slice(0, cut);
}

/** Splits a directory path into its cumulative crumbs. */
export function crumbsOf(path: string): Array<{ name: string; path: string }> {
	const parts = path.split("/").filter(Boolean);
	return parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join("/")}` }));
}

/**
 * Turns a hand-typed path into the canonical virtual path: one leading slash, no
 * trailing slash, no doubled separators.
 *
 * `..` is resolved here rather than passed on, because the listing endpoint has
 * no reason to understand it — a segment literally called `..` would be looked
 * up as a directory name. Only the lexical meaning is implemented, which is all
 * a text field can offer: nothing here knows what the storage actually holds.
 */
export function normalizeInputPath(raw: string): string {
	const resolved: string[] = [];
	for (const part of raw.trim().split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") resolved.pop();
		else resolved.push(part);
	}
	return resolved.length ? `/${resolved.join("/")}` : "/";
}

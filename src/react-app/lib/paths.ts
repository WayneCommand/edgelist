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

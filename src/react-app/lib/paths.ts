/**
 * Path arithmetic on virtual paths.
 *
 * A virtual path is always absolute, always uses `/`, never repeats a separator
 * and never has a trailing slash (except the root, which is just `/`). The Worker
 * normalizes the same way (`storage/types.ts:normalizePath`); the copies are
 * separate on purpose — the client must not import from the Worker, and a shared
 * module would put Worker code in the browser bundle.
 */

/** The directory holding `path`. The root's parent is itself. */
export function parentOf(path: string): string {
	const normalized = normalizePath(path);
	if (normalized === "/") return "/";
	const cut = normalized.lastIndexOf("/");
	return cut <= 0 ? "/" : normalized.slice(0, cut);
}

/** Canonicalises a hand-typed path: leading slash, no duplicates, `..` resolved. */
export function normalizePath(raw: string): string {
	const parts: string[] = [];
	for (const part of raw.trim().replace(/\\/g, "/").split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return `/${parts.join("/")}`;
}

/** `parent` joined with one child name. */
export function joinPath(parent: string, name: string): string {
	return normalizePath(`${parent}/${name}`);
}

/** The trailing segment of a path; the root is `/`. */
export function nameOf(path: string): string {
	const normalized = normalizePath(path);
	if (normalized === "/") return "/";
	return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/**
 * The cumulative crumbs of a path, root first.
 *
 * `/a/b` → `[{name:"", path:"/"}, {name:"a", path:"/a"}, {name:"b", path:"/a/b"}]`.
 * The root's name is empty because the breadcrumb renders the site's `home_icon`
 * and the word "Home" there (§3.4) rather than a path segment.
 */
export function crumbsOf(path: string): Array<{ name: string; path: string }> {
	const normalized = normalizePath(path);
	const parts = normalized.split("/").filter(Boolean);
	const crumbs: Array<{ name: string; path: string }> = [{ name: "", path: "/" }];
	let current = "";
	for (const part of parts) {
		current += `/${part}`;
		crumbs.push({ name: part, path: current });
	}
	return crumbs;
}

/**
 * Whether `path` is `ancestor` or sits beneath it.
 *
 * Used to decide whether a mount serves a path — the boundary is the separator,
 * not the string prefix, so `/a-b` is not under `/a`.
 */
export function isUnder(ancestor: string, path: string): boolean {
	const parent = normalizePath(ancestor);
	const child = normalizePath(path);
	if (parent === "/") return true;
	return child === parent || child.startsWith(`${parent}/`);
}

/**
 * A path as a URL.
 *
 * Each segment is encoded separately, so the separators survive while a name with
 * a space, a `#` or a `%` still round trips. `encodeURI` on the whole path would
 * leave `#` alone, which truncates the route.
 */
export function pathToUrl(path: string): string {
	const normalized = normalizePath(path);
	if (normalized === "/") return "/";
	return normalized.split("/").map(encodeURIComponent).join("/");
}

/** A URL pathname back to a virtual path, tolerating a `%` that is not an escape. */
export function urlToPath(pathname: string): string {
	try {
		return normalizePath(decodeURIComponent(pathname));
	} catch {
		return normalizePath(pathname);
	}
}

/**
 * The mount that serves `path`, from a list of mount paths.
 *
 * Longest prefix wins, exactly as the Worker's `selectStorage` resolves it, so a
 * client-side guess about writability cannot disagree with the server about which
 * storage a path lands in.
 */
export function mountFor(path: string, mounts: readonly string[]): string | null {
	let best: string | null = null;
	for (const mount of mounts) {
		const candidate = mount === "/" ? "/" : mount.replace(/\/+$/, "");
		if (!isUnder(candidate, path)) continue;
		if (best === null || candidate.length > best.length) best = candidate;
	}
	return best;
}

export type Route =
	| { kind: "files"; path: string }
	| { kind: "login" }
	| { kind: "storages" }
	| { kind: "metadata" }
	| { kind: "backup" };

/** Canonical paths, aligned with OpenList: files live at `/`, management under `/@manage/*`. */
export const ROUTES = {
	files: (path: string = "/") => normalizeRoutePath(path),
	login: "/@login",
	storages: "/@manage/storages",
	metadata: "/@manage/metadata",
	backup: "/@manage/backup-restore",
} as const;

export function normalizeRoutePath(pathname: string) {
	return pathname.replace(/\/+$/, "") || "/";
}

/** The virtual file path for a location; management routes fall back to the root. */
export function filesPathFor(pathname: string): string {
	const route = routeFor(pathname);
	return route.kind === "files" ? route.path : "/";
}

/**
 * `location.pathname` keeps percent escapes, so `/@login` arrives as
 * `/%40login` and a folder called `my folder` as `/my%20folder`. The file API
 * wants decoded names, so decode once here.
 */
function decodePathname(pathname: string) {
	try {
		return decodeURIComponent(pathname);
	} catch {
		// A stray `%` is a legal file name; leave it untouched.
		return pathname;
	}
}

export function routeFor(pathname: string): Route {
	const path = normalizeRoutePath(decodePathname(pathname));
	if (path === ROUTES.login) return { kind: "login" };
	if (path === ROUTES.storages) return { kind: "storages" };
	if (path === ROUTES.metadata) return { kind: "metadata" };
	if (path === ROUTES.backup) return { kind: "backup" };
	return { kind: "files", path };
}

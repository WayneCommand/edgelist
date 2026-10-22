/**
 * The app's routes, as data.
 *
 * OpenList's shape is kept deliberately: files live at `/` and management under
 * `/@manage/*`, because a deployment's bookmarks, a link pasted into an issue and
 * the spec's own URL parameters all name those paths. Only three management pages
 * exist — the Worker has no users, shares, tasks, indexes or plugins, so a route
 * for them would be a page with nothing behind it.
 */

export type Route =
	| { kind: "files"; path: string }
	| { kind: "login" }
	| { kind: "storages" }
	| { kind: "storage-add" }
	| { kind: "storage-edit"; id: number }
	| { kind: "metas" }
	| { kind: "meta-add" }
	| { kind: "meta-edit"; id: number }
	| { kind: "backup" }
	| { kind: "profile" }
	| { kind: "shares" }
	| { kind: "share"; id: string }
	| { kind: "about" };

export const ROUTES = {
	files: (path = "/") => normalize(path),
	login: "/@login",
	profile: "/@manage",
	storages: "/@manage/storages",
	storageAdd: "/@manage/storages/add",
	storageEdit: (id: number | string) => `/@manage/storages/edit/${id}`,
	metas: "/@manage/metas",
	metaAdd: "/@manage/metas/add",
	metaEdit: (id: number | string) => `/@manage/metas/edit/${id}`,
	shares: "/@manage/shares",
	backup: "/@manage/backup-restore",
	about: "/@manage/about",
} as const;

export function normalize(path: string): string {
	const trimmed = path.replace(/\/+$/, "");
	return trimmed || "/";
}

/**
 * `location.pathname` keeps percent escapes, so `/@login` can arrive as
 * `/%40login` and `my folder` as `/my%20folder`. The file API wants decoded
 * names, so decode once here and tolerate a stray `%`.
 */
function decode(pathname: string): string {
	try {
		return decodeURIComponent(pathname);
	} catch {
		return pathname;
	}
}

export function routeFor(pathname: string): Route {
	const path = normalize(decode(pathname));
	if (path === ROUTES.login) return { kind: "login" };
	if (path === ROUTES.profile) return { kind: "profile" };
	if (path === ROUTES.storages) return { kind: "storages" };
	if (path === ROUTES.storageAdd) return { kind: "storage-add" };
	if (path === ROUTES.metas) return { kind: "metas" };
	if (path === ROUTES.metaAdd) return { kind: "meta-add" };
	if (path === ROUTES.backup) return { kind: "backup" };
	if (path === ROUTES.about) return { kind: "about" };
	if (path === ROUTES.shares) return { kind: "shares" };

	// A share link is a page of its own, not a path in the file namespace: it is
	// public, and treating `/s/waynecos/token.md` as a file called
	// `s/waynecos/token.md` is how a visitor would land on a sign-in screen for a
	// link they were given. The whole remainder is the shared path; the
	// `/download` suffix is answered by the Worker before the SPA ever sees it.
	const share = /^\/s\/(.+)$/.exec(path);
	if (share) return { kind: "share", id: share[1] };

	const storageEdit = /^\/@manage\/storages\/edit\/(\d+)$/.exec(path);
	if (storageEdit) return { kind: "storage-edit", id: Number(storageEdit[1]) };
	const metaEdit = /^\/@manage\/metas\/edit\/(\d+)$/.exec(path);
	if (metaEdit) return { kind: "meta-edit", id: Number(metaEdit[1]) };

	// An unmatched `/@manage/...` is a management path that does not exist; it
	// must not fall through to the file browser, where it would be listed as a
	// folder called `@manage`.
	if (path.startsWith("/@manage")) return { kind: "profile" };

	return { kind: "files", path };
}

/** The virtual file path for a location. Management routes have none. */
export function filesPathFor(pathname: string): string {
	const route = routeFor(pathname);
	return route.kind === "files" ? route.path : "/";
}

/** Whether a route is inside the management shell. */
export function isManageRoute(route: Route): boolean {
	return route.kind !== "files" && route.kind !== "login" && route.kind !== "share";
}

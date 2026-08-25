export type Route =
	| { kind: "files"; path: string }
	| { kind: "storages" }
	| { kind: "metadata" }
	| { kind: "backup" };

export function normalizeRoutePath(pathname: string) {
	return pathname.replace(/\/+$/, "") || "/";
}

export function routeFor(pathname: string): Route {
	const path = normalizeRoutePath(pathname);
	if (path === "/@manage/storages") return { kind: "storages" };
	if (path === "/@manage/metadata") return { kind: "metadata" };
	if (path === "/@manage/backup-restore") return { kind: "backup" };
	return { kind: "files", path };
}

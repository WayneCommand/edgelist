import type { FileObject, ListOptions, StorageAdapter, StorageConfig } from "./types";

interface WebdavAddition {
	url?: string;
	username?: string;
	password?: string;
}

function xmlValue(xml: string, tag: string): string {
	return xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<`, "i"))?.[1] ?? "";
}

function toObject(href: string, size: string, modified: string, isDir: boolean): FileObject {
	const path = new URL(href, "https://edgelist.invalid").pathname;
	const clean = path.replace(/\/$/, "") || "/";
	return {
		name: clean.split("/").pop() || "/",
		size: Number(size) || 0,
		is_dir: isDir,
		modified: modified ? new Date(modified).toISOString() : new Date(0).toISOString(),
		created: modified ? new Date(modified).toISOString() : new Date(0).toISOString(),
		path: clean,
	};
}

export class WebdavAdapter implements StorageAdapter {
	readonly driver = "webdav" as const;
	private readonly baseUrl: string;
	private readonly headers: Headers;

	constructor(config: StorageConfig) {
		const addition = JSON.parse(config.addition || "{}") as WebdavAddition;
		if (!addition.url) throw new Error("WebDAV storage requires addition.url");
		this.baseUrl = addition.url.replace(/\/$/, "");
		this.headers = new Headers();
		if (addition.username || addition.password) this.headers.set("Authorization", `Basic ${btoa(`${addition.username ?? ""}:${addition.password ?? ""}`)}`);
	}

	private request(path: string, init: RequestInit = {}) {
		return fetch(`${this.baseUrl}${path === "/" ? "" : path}`, { ...init, headers: new Headers({ ...Object.fromEntries(this.headers), ...(init.headers ?? {}) }) });
	}

	async list(path: string, options: ListOptions) {
		const response = await this.request(path, { method: "PROPFIND", headers: { Depth: "1" } });
		if (!response.ok) throw new Error(`WebDAV list failed with ${response.status}`);
		const xml = await response.text();
		const content: FileObject[] = [];
		for (const match of xml.matchAll(/<[^:>]*:?response[^>]*>([\s\S]*?)<\/[a-zA-Z0-9:_-]*response>/gi)) {
			const item = match[1];
			const href = xmlValue(item, "href");
			if (!href || href.replace(/\/$/, "") === path.replace(/\/$/, "")) continue;
			content.push(toObject(href, xmlValue(item, "getcontentlength"), xmlValue(item, "getlastmodified"), /collection/i.test(item)));
		}
		const pageSize = options.per_page || content.length;
		const start = Math.max(0, (options.page - 1) * pageSize);
		return { content: content.slice(start, start + pageSize), total: content.length };
	}

	async get(path: string) {
		const response = await this.request(path, { method: "PROPFIND", headers: { Depth: "0" } });
		if (!response.ok) throw new Error("File not found");
		const xml = await response.text();
		return toObject(path, xmlValue(xml, "getcontentlength"), xmlValue(xml, "getlastmodified"), /collection/i.test(xml));
	}

	async read(path: string, range?: string) {
		return this.request(path, { headers: range ? { Range: range } : undefined });
	}

	async write(path: string, request: Request) {
		const response = await this.request(path, { method: "PUT", headers: { "content-type": request.headers.get("content-type") ?? "application/octet-stream" }, body: request.body });
		if (!response.ok) throw new Error(`WebDAV upload failed with ${response.status}`);
	}

	async mkdir(path: string) {
		const response = await this.request(path, { method: "MKCOL" });
		if (!response.ok) throw new Error(`WebDAV mkdir failed with ${response.status}`);
	}

	async remove(path: string) {
		const response = await this.request(path, { method: "DELETE" });
		if (!response.ok) throw new Error(`WebDAV delete failed with ${response.status}`);
	}

	async rename(path: string, name: string, overwrite: boolean) {
		const target = `${path.slice(0, path.lastIndexOf("/") + 1)}${name}`;
		const response = await this.request(path, { method: "MOVE", headers: { Destination: `${this.baseUrl}${target}`, Overwrite: overwrite ? "T" : "F" } });
		if (!response.ok) throw new Error(`WebDAV rename failed with ${response.status}`);
	}
}

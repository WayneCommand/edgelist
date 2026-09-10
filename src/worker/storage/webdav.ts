import type { FileObject, ListOptions, StorageAdapter, StorageConfig, TransferOptions } from "./types";
import { normalizePath } from "./types";

interface WebdavAddition { url?: string; address?: string; username?: string; password?: string; root_folder_path?: string; skip_tls_verify?: boolean }

function xmlValue(xml: string, tag: string): string { return xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<`, "i"))?.[1] ?? ""; }

function toObject(path: string, size: string, modified: string, isDir: boolean): FileObject {
	const clean = normalizePath(path);
	const date = modified ? new Date(modified).toISOString() : new Date(0).toISOString();
	return { name: clean.split("/").filter(Boolean).pop() ?? "/", size: Number(size) || 0, is_dir: isDir, modified: date, created: date, path: clean, mask: 0 };
}

export class WebdavAdapter implements StorageAdapter {
	readonly driver = "webdav" as const;
	readonly capabilities = new Set(["read", "write", "mkdir", "remove", "rename", "copy", "move"] as const);
	private readonly endpoint: URL;
	private readonly rootPath: string;
	private readonly headers: Headers;

	constructor(config: StorageConfig) {
		const addition = JSON.parse(config.addition || "{}") as WebdavAddition;
		const endpoint = addition.url ?? addition.address;
		if (!endpoint) throw new Error("WebDAV storage requires addition.url or addition.address");
		this.endpoint = new URL(endpoint);
		const configuredRoot = normalizePath(addition.root_folder_path ?? "/");
		this.rootPath = `${this.endpoint.pathname.replace(/\/$/, "")}${configuredRoot === "/" ? "" : configuredRoot}`;
		this.headers = new Headers();
		if (addition.username || addition.password) this.headers.set("Authorization", `Basic ${btoa(`${addition.username ?? ""}:${addition.password ?? ""}`)}`);
	}

	private url(path: string) {
		const url = new URL(this.endpoint);
		const relative = normalizePath(path);
		url.pathname = `${this.rootPath}${relative === "/" ? "" : relative.split("/").map((part) => encodeURIComponent(part)).join("/")}` || "/";
		return url;
	}

	private request(path: string, init: RequestInit = {}) {
		const headers = new Headers(this.headers);
		for (const [key, value] of new Headers(init.headers).entries()) headers.set(key, value);
		return fetch(this.url(path), { ...init, headers });
	}

	private relativeHref(href: string): string {
		const hrefUrl = new URL(href, this.endpoint);
		const root = this.rootPath.replace(/\/$/, "");
		const path = decodeURIComponent(hrefUrl.pathname);
		return normalizePath(path.startsWith(root) ? path.slice(root.length) || "/" : path);
	}

	async list(path: string, options: ListOptions) {
		const response = await this.request(path, { method: "PROPFIND", headers: { Depth: "1" } });
		if (!response.ok) throw new Error(`WebDAV list failed with ${response.status}`);
		const xml = await response.text();
		const content: FileObject[] = [];
		for (const match of xml.matchAll(/<[^:>]*:?response[^>]*>([\s\S]*?)<\/[a-zA-Z0-9:_-]*response>/gi)) {
			const item = match[1];
			const itemPath = this.relativeHref(xmlValue(item, "href"));
			if (!itemPath || itemPath === normalizePath(path)) continue;
			content.push(toObject(itemPath, xmlValue(item, "getcontentlength"), xmlValue(item, "getlastmodified"), /collection/i.test(item)));
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

	read(path: string, range?: string) { return this.request(path, { headers: range ? { Range: range } : undefined }); }

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
		const target = normalizePath(`${path.slice(0, path.lastIndexOf("/") + 1)}${name}`);
		const response = await this.request(path, { method: "MOVE", headers: { Destination: this.url(target).toString(), Overwrite: overwrite ? "T" : "F" } });
		if (!response.ok) throw new Error(`WebDAV rename failed with ${response.status}`);
	}

	private transfer(method: "COPY" | "MOVE", source: string, destination: string, options: TransferOptions) {
		return this.request(source, {
			method,
			headers: { Destination: this.url(destination).toString(), Overwrite: options.overwrite ? "T" : "F" },
		}).then((response) => {
			if (!response.ok) throw new Error(`WebDAV ${method.toLowerCase()} failed with ${response.status}`);
		});
	}

	copy(source: string, destination: string, options: TransferOptions) {
		return this.transfer("COPY", source, destination, options);
	}

	move(source: string, destination: string, options: TransferOptions) {
		return this.transfer("MOVE", source, destination, options);
	}
}

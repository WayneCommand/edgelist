import type { FileObject, ListOptions, StorageAdapter, StorageConfig, TransferOptions } from "./types";

interface OpenListAddition {
	base_url?: string;
	token?: string;
	username?: string;
	password?: string;
}

interface OpenListEnvelope<T> {
	code: number;
	message: string;
	data: T;
}

export class OpenListAdapter implements StorageAdapter {
	readonly driver = "openlist" as const;
	readonly capabilities = new Set(["read", "write", "mkdir", "remove", "rename", "copy", "move", "merge"] as const);
	private readonly baseUrl: string;
	private readonly headers: Headers;
	private readonly username?: string;
	private readonly password?: string;
	private authPromise?: Promise<void>;

	constructor(config: StorageConfig) {
		const addition = JSON.parse(config.addition || "{}") as OpenListAddition;
		if (!addition.base_url) throw new Error("OpenList storage requires addition.base_url");
		this.baseUrl = addition.base_url.replace(/\/$/, "");
		this.headers = new Headers({ "content-type": "application/json" });
		this.username = addition.username;
		this.password = addition.password;
		if (addition.token) this.headers.set("Authorization", addition.token);
	}

	private async authenticate() {
		if (this.headers.has("Authorization") || !this.username || !this.password) return;
		if (!this.authPromise) {
			this.authPromise = (async () => {
				const response = await fetch(`${this.baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: this.username, password: this.password }) });
				const result = await response.json() as OpenListEnvelope<{ token: string }>;
				if (!response.ok || result.code !== 200 || !result.data?.token) throw new Error(result.message || "OpenList login failed");
				this.headers.set("Authorization", result.data.token);
			})();
		}
		await this.authPromise;
	}

	private pathUrl(path: string) {
		return `${this.baseUrl}${path.split("/").map((part) => part ? encodeURIComponent(part) : "").join("/")}`;
	}

	private async json<T>(path: string, init: RequestInit): Promise<T> {
		await this.authenticate();
		const response = await fetch(`${this.baseUrl}/api${path}`, {
			...init,
			headers: new Headers({ ...Object.fromEntries(this.headers), ...(init.headers ?? {}) }),
		});
		const result = (await response.json()) as OpenListEnvelope<T>;
		if (!response.ok || result.code !== 200) throw new Error(result.message || `OpenList returned ${response.status}`);
		return result.data;
	}

	list(path: string, options: ListOptions) {
		return this.json<{ content: FileObject[]; total: number }>("/fs/list", {
			method: "POST",
			body: JSON.stringify({ path, page: options.page, per_page: options.per_page, refresh: options.refresh }),
		});
	}

	get(path: string) {
		return this.json<FileObject>("/fs/get", { method: "POST", body: JSON.stringify({ path }) });
	}

	async read(path: string, range?: string) {
		await this.authenticate();
		const headers = new Headers(this.headers);
		headers.delete("content-type");
		if (range) headers.set("Range", range);
		return fetch(this.pathUrl(`/d${path}`), { headers });
	}

	async write(path: string, request: Request) {
		await this.authenticate();
		const headers = new Headers(request.headers);
		headers.set("File-Path", encodeURIComponent(path));
		if (!headers.has("Authorization") && this.headers.has("Authorization")) headers.set("Authorization", this.headers.get("Authorization")!);
		const response = await fetch(`${this.baseUrl}/api/fs/put`, { method: "PUT", headers, body: request.body });
		if (!response.ok) throw new Error(`OpenList upload failed with ${response.status}`);
	}

	async mkdir(path: string) {
		await this.json<null>("/fs/mkdir", { method: "POST", body: JSON.stringify({ path }) });
	}

	async remove(path: string) {
		const index = path.lastIndexOf("/");
		await this.json<null>("/fs/remove", {
			method: "POST",
			body: JSON.stringify({ dir: index > 0 ? path.slice(0, index) : "/", names: [path.slice(index + 1)] }),
		});
	}

	async rename(path: string, name: string, overwrite: boolean) {
		await this.json<null>("/fs/rename", { method: "POST", body: JSON.stringify({ path, name, overwrite }) });
	}

	private async transfer(kind: "copy" | "move", source: string, destination: string, options: TransferOptions): Promise<void> {
		const sourceDirectory = source.slice(0, source.lastIndexOf("/")) || "/";
		const destinationDirectory = destination.slice(0, destination.lastIndexOf("/")) || "/";
		await this.json<unknown>(`/fs/${kind}`, {
			method: "POST",
			body: JSON.stringify({
				src_dir: sourceDirectory,
				dst_dir: destinationDirectory,
				names: [source.slice(source.lastIndexOf("/") + 1)],
				overwrite: options.overwrite,
				skip_existing: false,
				merge: options.merge,
			}),
		});
	}

	async copy(source: string, destination: string, options: TransferOptions): Promise<void> {
		return this.transfer("copy", source, destination, options);
	}

	async move(source: string, destination: string, options: TransferOptions): Promise<void> {
		return this.transfer("move", source, destination, options);
	}
}

import type { FileObject, ListOptions, StorageAdapter, StorageConfig } from "./types";

interface S3Addition {
	endpoint?: string;
	region?: string;
	bucket?: string;
	access_key_id?: string;
	secret_access_key?: string;
	session_token?: string;
	force_path_style?: boolean;
}

const encoder = new TextEncoder();

function objectPath(path: string): string {
	return path.replace(/^\/+/, "");
}

function encode(value: string): string {
	return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(pathname: string): string {
	return pathname.split("/").map((segment) => encode(decodeURIComponent(segment))).join("/") || "/";
}

function hex(buffer: ArrayBuffer): string {
	return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
	return hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

function xmlValue(xml: string, tag: string): string {
	return xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<`, "i"))?.[1] ?? "";
}

function xmlItems(xml: string, tag: string): string[] {
	return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi"))].map((match) => match[1]);
}

function fileObject(key: string, size: string, modified: string, etag?: string, isDir = false): FileObject {
	const name = key.split("/").filter(Boolean).pop() ?? key;
	const date = modified ? new Date(modified).toISOString() : new Date(0).toISOString();
	return { name, size: isDir ? 0 : Number(size) || 0, is_dir: isDir, modified: date, created: date, path: `/${key}`, hashinfo: etag ? { etag: etag.replaceAll('"', "") } : undefined };
}

export class S3Adapter implements StorageAdapter {
	readonly driver = "object" as const;
	private readonly endpoint: URL;
	private readonly region: string;
	private readonly bucket: string;
	private readonly accessKeyId: string;
	private readonly secretAccessKey: string;
	private readonly sessionToken?: string;
	private readonly forcePathStyle: boolean;

	constructor(config: StorageConfig) {
		const addition = JSON.parse(config.addition || "{}") as S3Addition;
		if (!addition.endpoint || !addition.bucket || !addition.access_key_id || !addition.secret_access_key) throw new Error("S3 storage requires endpoint, bucket, access_key_id and secret_access_key");
		this.endpoint = new URL(addition.endpoint);
		this.region = addition.region || "us-east-1";
		this.bucket = addition.bucket;
		this.accessKeyId = addition.access_key_id;
		this.secretAccessKey = addition.secret_access_key;
		this.sessionToken = addition.session_token;
		this.forcePathStyle = addition.force_path_style ?? true;
	}

	private url(key = "", query?: Record<string, string>): URL {
		const url = new URL(this.endpoint);
		const prefix = this.forcePathStyle ? `/${encode(this.bucket)}` : "";
		if (!this.forcePathStyle) url.hostname = `${this.bucket}.${url.hostname}`;
		url.pathname = `${url.pathname.replace(/\/$/, "")}${prefix}${key ? `/${key.split("/").map(encode).join("/")}` : ""}`;
		for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
		return url;
	}

	private async request(method: string, key = "", options: { query?: Record<string, string>; headers?: Record<string, string>; body?: BodyInit | null } = {}) {
		const url = this.url(key, options.query);
		const payloadHash = "UNSIGNED-PAYLOAD";
		const headers = new Headers(options.headers);
		headers.set("host", url.host);
		headers.set("x-amz-content-sha256", payloadHash);
		if (this.sessionToken) headers.set("x-amz-security-token", this.sessionToken);
		const now = new Date();
		const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
		const date = amzDate.slice(0, 8);
		headers.set("x-amz-date", amzDate);
		const canonicalHeaders = [...headers.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name.toLowerCase()}:${value.trim().replace(/\s+/g, " ")}\n`).join("");
		const signedHeaders = [...headers.keys()].map((name) => name.toLowerCase()).sort().join(";");
		const canonicalQuery = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${encode(name)}=${encode(value)}`).join("&");
		const canonicalRequest = [method, canonicalPath(url.pathname), canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
		const scope = `${date}/${this.region}/s3/aws4_request`;
		const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonicalRequest)].join("\n");
		const kDate = await hmac(encoder.encode(`AWS4${this.secretAccessKey}`), date);
		const kRegion = await hmac(kDate, this.region);
		const kService = await hmac(kRegion, "s3");
		const signingKey = await hmac(kService, "aws4_request");
		const signature = hex(await hmac(signingKey, stringToSign));
		headers.set("authorization", `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
		return fetch(url, { method, headers, body: options.body });
	}

	async list(path: string, options: ListOptions) {
		const prefix = objectPath(path).replace(/\/$/, "");
		const response = await this.request("GET", "", { query: { "list-type": "2", delimiter: "/", prefix: prefix ? `${prefix}/` : "", "max-keys": String(options.per_page || 1000) } });
		if (!response.ok) throw new Error(`S3 list failed with ${response.status}`);
		const xml = await response.text();
		const directories = xmlItems(xml, "CommonPrefixes").map((item) => fileObject(xmlValue(item, "Prefix").replace(/\/$/, ""), "0", "", undefined, true));
		const files = xmlItems(xml, "Contents").map((item) => fileObject(xmlValue(item, "Key"), xmlValue(item, "Size"), xmlValue(item, "LastModified"), xmlValue(item, "ETag")));
		const content = [...directories, ...files];
		const pageSize = options.per_page || content.length;
		const start = Math.max(0, (options.page - 1) * pageSize);
		return { content: content.slice(start, start + pageSize), total: content.length };
	}

	async get(path: string) {
		const response = await this.request("HEAD", objectPath(path));
		if (!response.ok) throw new Error("File not found");
		return fileObject(objectPath(path), response.headers.get("content-length") ?? "0", response.headers.get("last-modified") ?? "", response.headers.get("etag") ?? undefined);
	}

	async read(path: string, range?: string) {
		const response = await this.request("GET", objectPath(path), { headers: range ? { range } : undefined });
		if (!response.ok) return new Response("Not found", { status: response.status });
		return response;
	}

	async write(path: string, request: Request) {
		const response = await this.request("PUT", objectPath(path), { headers: { "content-type": request.headers.get("content-type") ?? "application/octet-stream" }, body: request.body });
		if (!response.ok) throw new Error(`S3 upload failed with ${response.status}`);
	}

	async mkdir(path: string) {
		const response = await this.request("PUT", `${objectPath(path).replace(/\/$/, "")}/`, { body: new Uint8Array() });
		if (!response.ok) throw new Error(`S3 mkdir failed with ${response.status}`);
	}

	async remove(path: string) {
		const response = await this.request("DELETE", objectPath(path));
		if (!response.ok && response.status !== 404) throw new Error(`S3 delete failed with ${response.status}`);
	}

	async rename(path: string, name: string, overwrite: boolean) {
		const source = objectPath(path);
		const target = `${source.slice(0, source.lastIndexOf("/") + 1)}${name}`;
		if (!overwrite && (await this.request("HEAD", target)).ok) throw new Error("Target already exists");
		const copied = await this.request("PUT", target, { headers: { "x-amz-copy-source": `/${encode(this.bucket)}/${source.split("/").map(encode).join("/")}` } });
		if (!copied.ok) throw new Error(`S3 copy failed with ${copied.status}`);
		await this.remove(source);
	}
}

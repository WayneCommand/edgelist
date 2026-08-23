import type { FileObject, ListOptions, StorageAdapter, StorageConfig } from "./types";

function objectPath(path: string): string {
	return path.replace(/^\/+/, "");
}

function fileObject(key: string, object: R2Object | R2ObjectBody, isDir = false): FileObject {
	const name = key.split("/").filter(Boolean).pop() ?? key;
	return {
		name,
		size: isDir ? 0 : object.size,
		is_dir: isDir,
		modified: object.uploaded.toISOString(),
		created: object.uploaded.toISOString(),
		path: `/${key}`,
		hashinfo: "etag" in object ? { etag: object.etag } : undefined,
	};
}

export class R2Adapter implements StorageAdapter {
	readonly driver = "object" as const;
	private readonly bucket: R2Bucket;

	constructor(bucket: R2Bucket, _config: StorageConfig) {
		this.bucket = bucket;
	}

	async list(path: string, options: ListOptions) {
		const prefix = objectPath(path).replace(/\/$/, "");
		const listed = await this.bucket.list({ prefix: prefix ? `${prefix}/` : "", delimiter: "/", limit: options.per_page || 1000 });
		const directories = listed.delimitedPrefixes.map((key) => fileObject(key.replace(/\/$/, ""), { size: 0, uploaded: new Date(0) } as R2Object, true));
		const files = listed.objects.map((object) => fileObject(object.key, object));
		const content = [...directories, ...files];
		const start = Math.max(0, (options.page - 1) * (options.per_page || content.length));
		const pageSize = options.per_page || content.length;
		return { content: content.slice(start, start + pageSize), total: content.length };
	}

	async get(path: string) {
		const object = await this.bucket.head(objectPath(path));
		if (!object) throw new Error("File not found");
		return fileObject(object.key, object);
	}

	async read(path: string, range?: string) {
		const object = await this.bucket.get(objectPath(path), range ? { range } : undefined);
		if (!object) return new Response("Not found", { status: 404 });
		return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", etag: object.httpEtag } });
	}

	async write(path: string, request: Request) {
		await this.bucket.put(objectPath(path), request.body, { httpMetadata: { contentType: request.headers.get("content-type") ?? undefined } });
	}

	async mkdir(_path: string) {
		// R2 has no directories; an empty marker is unnecessary for list semantics.
	}

	async remove(path: string) {
		await this.bucket.delete(objectPath(path));
	}

	async rename(path: string, name: string, overwrite: boolean) {
		const source = objectPath(path);
		const target = `${source.slice(0, source.lastIndexOf("/") + 1)}${name}`;
		if (!overwrite && (await this.bucket.head(target))) throw new Error("Target already exists");
		const object = await this.bucket.get(source);
		if (!object) throw new Error("File not found");
		await this.bucket.put(target, object.body, { httpMetadata: object.httpMetadata });
		await this.bucket.delete(source);
	}
}

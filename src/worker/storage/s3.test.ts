import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorageConfig } from "./types";
import { S3Adapter } from "./s3";

function config(addition: Record<string, unknown>): StorageConfig {
	return {
		id: 1,
		mount_path: "/",
		order: 0,
		driver: "object",
		status: "work",
		addition: JSON.stringify(addition),
		remark: "",
		disabled: false,
	};
}

function listingXml() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
	<Name>bucket</Name>
	<KeyCount>3</KeyCount>
	<IsTruncated>false</IsTruncated>
	<CommonPrefixes><Prefix>photos/</Prefix></CommonPrefixes>
	<Contents><Key>single.txt</Key><LastModified>2024-01-01T00:00:00.000Z</LastModified><ETag>&quot;d41d8cd98f00b204e9800998ecf8427e&quot;</ETag><Size>10</Size></Contents>
	<Contents><Key>multipart.bin</Key><LastModified>2024-01-02T00:00:00.000Z</LastModified><ETag>&quot;5eb63bbbe01eeed093cb22bb8f5acdc3-4&quot;</ETag><Size>20</Size></Contents>
</ListBucketResult>`;
}

function stubbedAdapter() {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ ok: true, status: 200, text: async () => listingXml() })),
	);
	return new S3Adapter(
		config({
			endpoint: "https://s3.example.test",
			bucket: "bucket",
			access_key_id: "key",
			secret_access_key: "secret",
		}),
	);
}

describe("S3 adapter compatibility", () => {
	it("follows OpenList defaults for custom endpoints", () => {
		const adapter = new S3Adapter(
			config({ endpoint: "s3.example.test", bucket: "bucket", access_key_id: "key", secret_access_key: "secret" }),
		);
		expect(adapter).toBeDefined();
	});

	it("accepts the OpenList list object version option", () => {
		const adapter = new S3Adapter(
			config({
				endpoint: "https://s3.example.test",
				bucket: "bucket",
				access_key_id: "key",
				secret_access_key: "secret",
				list_object_version: "v2",
			}),
		);
		expect(adapter).toBeDefined();
	});
});

describe("S3 adapter listing", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("advertises an MD5 etag but skips multipart etags", async () => {
		const { content } = await stubbedAdapter().list("/", { page: 1, per_page: 0, refresh: false });
		const byName = Object.fromEntries(content.map((item) => [item.name, item]));
		expect(byName["single.txt"].hashinfo).toEqual({ etag: "d41d8cd98f00b204e9800998ecf8427e" });
		expect(byName["multipart.bin"].hashinfo).toBeUndefined();
	});

	it("marks every entry with an empty mask and the object provider", async () => {
		const { content } = await stubbedAdapter().list("/", { page: 1, per_page: 0, refresh: false });
		expect(content).toHaveLength(3);
		expect(content.every((item) => item.mask === 0 && item.provider === "object")).toBe(true);
		expect(content[0]).toMatchObject({ name: "photos", is_dir: true, size: 0 });
	});
});

describe("S3 adapter multipart", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** A stub that answers each multipart subresource and records the requests. */
	function recordingAdapter() {
		const calls: Array<{ method: string; url: URL; body: unknown }> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(input instanceof Request ? input.url : String(input));
				calls.push({ method: init?.method ?? "GET", url, body: init?.body });
				if (init?.method === "POST" && url.searchParams.has("uploads"))
					return new Response("<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>");
				if (init?.method === "PUT") return new Response(null, { status: 200, headers: { etag: '"part-etag"' } });
				return new Response(null, { status: 200 });
			}),
		);
		const adapter = new S3Adapter(
			config({
				endpoint: "https://s3.example.test",
				bucket: "bucket",
				access_key_id: "key",
				secret_access_key: "secret",
			}),
		);
		return { adapter, calls };
	}

	it("reads the upload id out of the initiation document", async () => {
		const { adapter, calls } = recordingAdapter();
		expect(await adapter.multipartInit("/big.bin")).toBe("u1");
		expect(calls[0].method).toBe("POST");
		expect(calls[0].url.searchParams.has("uploads")).toBe(true);
	});

	it("numbers parts from one and returns the ETag verbatim", async () => {
		const { adapter, calls } = recordingAdapter();
		const etag = await adapter.multipartUploadPart("/big.bin", "u1", 3, new ArrayBuffer(8));
		expect(etag).toBe('"part-etag"');
		expect(calls[0].url.searchParams.get("partNumber")).toBe("3");
		expect(calls[0].url.searchParams.get("uploadId")).toBe("u1");
	});

	it("sends the completion document in ascending part order", async () => {
		const { adapter, calls } = recordingAdapter();
		await adapter.multipartComplete("/big.bin", "u1", [
			{ part_number: 3, etag: '"c"' },
			{ part_number: 1, etag: '"a"' },
			{ part_number: 2, etag: '"b"' },
		]);
		const document = String(calls[0].body);
		// S3 rejects an out-of-order list, so the sort is load-bearing rather
		// than cosmetic.
		expect(document.indexOf("<PartNumber>1</PartNumber>")).toBeLessThan(document.indexOf("<PartNumber>2</PartNumber>"));
		expect(document.indexOf("<PartNumber>2</PartNumber>")).toBeLessThan(document.indexOf("<PartNumber>3</PartNumber>"));
		expect(document).toContain("<ETag>&quot;a&quot;</ETag>");
		expect(calls[0].url.searchParams.get("uploadId")).toBe("u1");
	});

	it("treats an abort of something already gone as done", async () => {
		const { adapter } = recordingAdapter();
		await expect(adapter.multipartAbort("/big.bin", "u1")).resolves.toBeUndefined();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 404 })),
		);
		await expect(adapter.multipartAbort("/big.bin", "u1")).resolves.toBeUndefined();
	});
});

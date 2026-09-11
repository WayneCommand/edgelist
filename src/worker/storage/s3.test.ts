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

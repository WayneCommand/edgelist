import { describe, expect, it } from "vitest";
import type { StorageConfig } from "./types";
import { S3Adapter } from "./s3";

function config(addition: Record<string, unknown>): StorageConfig {
	return { id: 1, mount_path: "/", order: 0, driver: "object", status: "work", addition: JSON.stringify(addition), remark: "", disabled: false, disable_index: false, enable_sign: false };
}

describe("S3 adapter compatibility", () => {
	it("follows OpenList defaults for custom endpoints", () => {
		const adapter = new S3Adapter(config({ endpoint: "https://s3.example.test", bucket: "bucket", access_key_id: "key", secret_access_key: "secret" }));
		expect(adapter).toBeDefined();
	});

	it("accepts the OpenList list object version option", () => {
		const adapter = new S3Adapter(config({ endpoint: "https://s3.example.test", bucket: "bucket", access_key_id: "key", secret_access_key: "secret", list_object_version: "v2" }));
		expect(adapter).toBeDefined();
	});
});

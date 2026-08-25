import { describe, expect, it } from "vitest";
import { publicFilePath } from "./fs";

describe("public file paths", () => {
	it("keeps every directory level under the storage mount", () => {
		expect(publicFilePath("/ibm", "a")).toBe("/ibm/a");
		expect(publicFilePath("/ibm/a/b", "c.txt")).toBe("/ibm/a/b/c.txt");
	});
});

import { describe, expect, it } from "vitest";
import {
	additionOf,
	coerceDefault,
	defaultAddition,
	driverFor,
	driverLabel,
	formItems,
	humanize,
	itemValue,
	newStorage,
	selectOptions,
	setField,
	storageFromJson,
	storageToJson,
	withDriver,
	type DriverInfo,
	type DriverItem,
} from "./drivers";
import type { Storage } from "./types";

const S3: DriverInfo = {
	key: "object",
	name: "S3",
	common: [
		{ name: "mount_path", type: "string", default: "", required: true },
		{ name: "order", type: "number", default: "0" },
		{ name: "order_by", type: "select", default: "", options: "name,size,modified" },
		{ name: "extract_folder", type: "select", default: "front", options: "front,back" },
	],
	additional: [
		{ name: "endpoint", type: "string", default: "", required: true },
		{ name: "bucket", type: "string", default: "", required: true },
		{ name: "secret_access_key", type: "string", default: "", required: true, secret: true },
		{ name: "force_path_style", type: "bool", default: "false" },
		{ name: "list_object_version", type: "select", default: "v2", options: "v1,v2" },
		{ name: "sign_url_expire", type: "number", default: "4" },
	],
};

const WEBDAV: DriverInfo = {
	key: "webdav",
	name: "WebDav",
	common: [{ name: "mount_path", type: "string", default: "", required: true }],
	additional: [{ name: "url", type: "string", default: "", required: true }],
};

const DRIVERS = [S3, WEBDAV];

function storage(overrides: Partial<Storage> = {}): Storage {
	return {
		id: 7,
		mount_path: "/waynecos",
		driver: "object",
		addition: JSON.stringify({ endpoint: "https://s3.example.com", bucket: "b", force_path_style: false }),
		remark: "cos",
		order: 3,
		status: "work",
		...overrides,
	};
}

describe("driverFor", () => {
	it("matches on the storage key", () => {
		expect(driverFor(DRIVERS, "object")).toBe(S3);
		expect(driverFor(DRIVERS, "webdav")).toBe(WEBDAV);
	});

	it("also matches the OpenList display name and spelling", () => {
		expect(driverFor(DRIVERS, "S3")).toBe(S3);
		expect(driverFor(DRIVERS, "s3")).toBe(S3);
		expect(driverFor(DRIVERS, "WebDav")).toBe(WEBDAV);
		expect(driverFor(DRIVERS, "WEBDAV")).toBe(WEBDAV);
	});

	it("returns nothing for an unknown driver", () => {
		expect(driverFor(DRIVERS, "ftp")).toBeUndefined();
	});

	it("labels a driver by its display name, falling back to the raw value", () => {
		expect(driverLabel(DRIVERS, "object")).toBe("S3");
		// While the registry is still loading there is nothing to look up.
		expect(driverLabel([], "object")).toBe("object");
	});
});

describe("additionOf", () => {
	it("parses an object", () => {
		expect(additionOf({ addition: '{"bucket":"b"}' })).toEqual({ bucket: "b" });
	});

	it("falls back to an empty object for anything unusable", () => {
		expect(additionOf({ addition: "" })).toEqual({});
		expect(additionOf({ addition: "{oops" })).toEqual({});
		expect(additionOf({ addition: "[1,2]" })).toEqual({});
		expect(additionOf({ addition: "null" })).toEqual({});
		expect(additionOf({ addition: 42 as unknown as string })).toEqual({});
	});
});

describe("coerceDefault", () => {
	it("reads the declared type out of the default string", () => {
		expect(coerceDefault({ name: "n", type: "number", default: "4" })).toBe(4);
		expect(coerceDefault({ name: "b", type: "bool", default: "true" })).toBe(true);
		expect(coerceDefault({ name: "b", type: "bool", default: "false" })).toBe(false);
		expect(coerceDefault({ name: "s", type: "string", default: "hi" })).toBe("hi");
	});

	it("does not produce NaN for a malformed number", () => {
		expect(coerceDefault({ name: "n", type: "number", default: "" })).toBe(0);
	});
});

describe("defaultAddition", () => {
	it("keeps the non-empty defaults and drops the empty ones", () => {
		// Writing `""` for every optional field would litter the record with keys
		// that then travel into a backup.
		expect(defaultAddition(S3)).toEqual({
			force_path_style: false,
			list_object_version: "v2",
			sign_url_expire: 4,
		});
	});

	it("is empty for a driver whose fields all default to blank", () => {
		expect(defaultAddition(WEBDAV)).toEqual({});
	});
});

describe("withDriver", () => {
	it("replaces the driver-specific half rather than merging it", () => {
		const next = withDriver(storage(), "webdav", WEBDAV);
		expect(next.driver).toBe("webdav");
		// The S3 keys must not survive a switch to WebDAV.
		expect(additionOf(next)).toEqual({});
	});

	it("keeps the fields that are not driver-specific", () => {
		const next = withDriver(storage(), "webdav", WEBDAV);
		expect(next.mount_path).toBe("/waynecos");
		expect(next.remark).toBe("cos");
	});

	it("clears the addition when the definition is unknown", () => {
		expect(additionOf(withDriver(storage(), "ftp", undefined))).toEqual({});
	});
});

describe("itemValue", () => {
	const boolItem: DriverItem = { name: "force_path_style", type: "bool", default: "false" };
	const numberItem: DriverItem = { name: "sign_url_expire", type: "number", default: "4" };

	it("uses the stored value when the key exists", () => {
		expect(itemValue({ bucket: "b" }, { name: "bucket", type: "string", default: "" })).toBe("b");
		expect(itemValue({ force_path_style: true }, boolItem)).toBe(true);
	});

	it("falls back to the declared default when the key is absent", () => {
		expect(itemValue({}, { name: "list_object_version", type: "select", default: "v2" })).toBe("v2");
		expect(itemValue({}, numberItem)).toBe(4);
	});

	it("treats a stored string as the typed value", () => {
		// A backup imported from elsewhere may hold "true" where a bool belongs.
		expect(itemValue({ force_path_style: "true" }, boolItem)).toBe(true);
		expect(itemValue({ sign_url_expire: "9" }, numberItem)).toBe(9);
	});

	it("treats an explicitly stored empty string as empty, not as the default", () => {
		expect(itemValue({ bucket: "" }, { name: "bucket", type: "string", default: "fallback" })).toBe("");
	});
});

describe("setField", () => {
	it("writes a common item onto the storage record", () => {
		const next = setField(storage(), "common", "order", 9);
		expect(next.order).toBe(9);
		expect(additionOf(next).endpoint).toBe("https://s3.example.com");
	});

	it("writes a driver item into the addition without dropping the others", () => {
		const next = setField(storage(), "additional", "bucket", "other");
		expect(additionOf(next)).toEqual({
			endpoint: "https://s3.example.com",
			bucket: "other",
			force_path_style: false,
		});
	});
});

describe("selectOptions", () => {
	it("splits, trims and drops the blanks", () => {
		expect(selectOptions({ name: "s", type: "select", default: "", options: "asc, desc" })).toEqual(["asc", "desc"]);
		expect(selectOptions({ name: "s", type: "select", default: "" })).toEqual([]);
	});
});

describe("formItems", () => {
	it("lists the common items before the driver ones, each with its scope", () => {
		const items = formItems(WEBDAV);
		expect(items.map((entry) => entry.item.name)).toEqual(["mount_path", "url"]);
		expect(items.map((entry) => entry.scope)).toEqual(["common", "additional"]);
	});
});

describe("humanize", () => {
	it("turns a field name into a label", () => {
		expect(humanize("secret_access_key")).toBe("Secret Access Key");
		expect(humanize("mount_path")).toBe("Mount Path");
		expect(humanize("url")).toBe("Url");
	});
});

describe("newStorage", () => {
	it("starts every field at its declared default", () => {
		const draft = newStorage(S3);
		expect(draft.id).toBe(0);
		expect(draft.driver).toBe("object");
		// mount_path is required and has no default, so it starts empty and the
		// form's own validation catches it.
		expect(draft.mount_path).toBe("");
		expect(draft.order).toBe(0);
		expect(draft.extract_folder).toBe("front");
		expect(additionOf(draft)).toEqual({ force_path_style: false, list_object_version: "v2", sign_url_expire: 4 });
	});

	it("produces something usable even before the registry has loaded", () => {
		const draft = newStorage(undefined);
		expect(draft.driver).toBe("object");
		expect(additionOf(draft)).toEqual({});
	});
});

describe("storage JSON", () => {
	it("round trips a storage", () => {
		const original = storage();
		expect(storageFromJson(storageToJson(original))).toMatchObject({
			mount_path: "/waynecos",
			driver: "object",
			remark: "cos",
		});
	});

	it("drops the fields the server owns", () => {
		const imported = storageFromJson(
			JSON.stringify({ ...storage(), id: 99, disabled: true, status: "disabled", modified: "2020-01-01" }),
		);
		expect(imported.id).toBeUndefined();
		expect(imported.disabled).toBeUndefined();
		expect(imported.status).toBeUndefined();
		expect(imported.modified).toBeUndefined();
	});

	it("accepts an addition that arrived as an object", () => {
		const imported = storageFromJson(
			JSON.stringify({ mount_path: "/a", driver: "webdav", addition: { url: "https://dav.example.com" } }),
		);
		expect(imported.addition).toBe('{"url":"https://dav.example.com"}');
	});

	it("rejects text that is not a storage, with a message for the user", () => {
		expect(() => storageFromJson("{oops")).toThrow("not valid JSON");
		expect(() => storageFromJson("[1]")).toThrow("has to be a JSON object");
		expect(() => storageFromJson('{"driver":"object"}')).toThrow("mount_path is required");
		expect(() => storageFromJson('{"mount_path":"/a"}')).toThrow("driver is required");
	});
});

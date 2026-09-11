import { api } from "./api";
import type { Storage } from "./types";

/**
 * The driver registry as the admin API exposes it. A storage form is built from
 * these items instead of hard-coded fields, so adding a driver never means
 * touching the UI — and a field only exists if the adapter actually reads it.
 */

export type DriverItemType = "string" | "number" | "bool" | "select" | "text";

export type DriverItem = {
	name: string;
	type: DriverItemType;
	default: string;
	/** Comma separated choices, used when `type` is `select`. */
	options?: string;
	required?: boolean;
	help?: string;
	secret?: boolean;
};

export type DriverInfo = {
	/** Matches `Storage.driver`; the display name does not. */
	key: string;
	/** OpenList-facing label, used for the badge and upstream calls. */
	name: string;
	common: DriverItem[];
	additional: DriverItem[];
};

/** Which bucket an item lives in: the storage record, or its `addition` JSON. */
export type DriverScope = "common" | "additional";

export function fetchDrivers(): Promise<DriverInfo[]> {
	return api<DriverInfo[]>("/api/admin/driver/list");
}

/** The definition serving a storage, tolerating OpenList's spelling of the key. */
export function driverFor(drivers: readonly DriverInfo[], driver: string): DriverInfo | undefined {
	const value = String(driver).toLowerCase();
	return drivers.find((item) => item.key === value || item.name.toLowerCase() === value);
}

/** A driver's label for display, falling back to the raw key while loading. */
export function driverLabel(drivers: readonly DriverInfo[], driver: string): string {
	return driverFor(drivers, driver)?.name ?? String(driver);
}

/** The parsed `addition`, or `{}` when it is absent, malformed or not an object. */
export function additionOf(storage: Pick<Storage, "addition">): Record<string, unknown> {
	if (typeof storage.addition !== "string") return {};
	try {
		const value = JSON.parse(storage.addition) as unknown;
		return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** An item's `default` string as the type the form control expects. */
export function coerceDefault(item: DriverItem): string | number | boolean {
	if (item.type === "number") {
		const value = Number(item.default);
		return Number.isFinite(value) ? value : 0;
	}
	if (item.type === "bool") return item.default === "true";
	return item.default;
}

/**
 * The addition a driver starts from: its items' defaults, without the empty
 * ones. Empty defaults are omitted rather than written as `""` so a fresh
 * storage does not accumulate meaningless keys that then travel into a backup.
 */
export function defaultAddition(info: DriverInfo): Record<string, unknown> {
	const addition: Record<string, unknown> = {};
	for (const item of info.additional) {
		if (item.default === "") continue;
		addition[item.name] = coerceDefault(item);
	}
	return addition;
}

/**
 * Switch a storage to another driver. The driver-specific half is replaced, not
 * merged: keeping S3's keys while the driver says WebDAV would leave the form
 * showing fields that no longer belong to it, and the stale values would be
 * saved back out.
 */
export function withDriver(storage: Storage, driver: string, info: DriverInfo | undefined): Storage {
	return {
		...storage,
		driver: driver as Storage["driver"],
		addition: JSON.stringify(info ? defaultAddition(info) : {}),
	};
}

/** The value to render: what is stored when the key exists, else the default. */
export function itemValue(source: Record<string, unknown>, item: DriverItem): string | number | boolean {
	if (!(item.name in source)) return coerceDefault(item);
	const value = source[item.name];
	if (item.type === "bool") return value === true || value === "true";
	if (item.type === "number") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return value === undefined || value === null ? "" : String(value);
}

/** Write one item back, into the storage record or into its `addition`. */
export function setField(storage: Storage, scope: DriverScope, name: string, value: unknown): Storage {
	if (scope === "common") return { ...storage, [name]: value };
	return { ...storage, addition: JSON.stringify({ ...additionOf(storage), [name]: value }) };
}

/** The `options` of a select item, as the list a dropdown needs. */
export function selectOptions(item: DriverItem): string[] {
	return (item.options ?? "")
		.split(",")
		.map((option) => option.trim())
		.filter(Boolean);
}

/** The items a form shows for a driver, common ones first. */
export function formItems(info: DriverInfo): ReadonlyArray<{ scope: DriverScope; item: DriverItem }> {
	return [
		...info.common.map((item) => ({ scope: "common" as const, item })),
		...info.additional.map((item) => ({ scope: "additional" as const, item })),
	];
}

/**
 * A field name as a label: `secret_access_key` becomes "Secret Access Key".
 *
 * Deriving it beats a lookup table, because a table is exactly the hard-coding
 * this form exists to remove — a new driver would ship a field labelled
 * `some_new_key` until someone remembered to add a row.
 */
export function humanize(name: string): string {
	return name
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** A blank storage for a driver: every field starts at its declared default. */
export function newStorage(info: DriverInfo | undefined): Storage {
	const base: Storage = {
		id: 0,
		mount_path: "",
		driver: (info?.key ?? "object") as Storage["driver"],
		addition: JSON.stringify(info ? defaultAddition(info) : {}),
		remark: "",
		order: 0,
		status: "work",
		disabled: false,
	};
	if (!info) return base;
	const record = base as unknown as Record<string, unknown>;
	for (const item of info.common) record[item.name] = coerceDefault(item);
	return base;
}

/**
 * Fields the server owns. Importing a storage that carries them would let a
 * pasted blob claim another mount's id or its status, so they are dropped —
 * the same four OpenList's importer drops.
 */
const SERVER_OWNED_FIELDS = ["id", "disabled", "modified", "status"] as const;

/** A storage as the text to paste elsewhere. */
export function storageToJson(storage: Storage): string {
	return JSON.stringify(storage, null, 2);
}

/**
 * A storage from pasted JSON, minus the fields the server owns. Throws with a
 * message meant for the user, because the only caller is a dialog that shows it.
 */
export function storageFromJson(text: string): Storage {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("That is not valid JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("A storage has to be a JSON object");
	}
	const source = { ...(parsed as Record<string, unknown>) };
	for (const key of SERVER_OWNED_FIELDS) delete source[key];
	// Some exports carry `addition` as an object rather than the string the API
	// stores, and the form needs the string form either way.
	if (typeof source.addition !== "string") source.addition = JSON.stringify(source.addition ?? {});
	if (typeof source.mount_path !== "string" || !source.mount_path) throw new Error("mount_path is required");
	if (typeof source.driver !== "string" || !source.driver) throw new Error("driver is required");
	return source as unknown as Storage;
}

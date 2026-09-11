import type { StorageAdapter, StorageCapability, StorageConfig, StorageDriver } from "./types";
import { OpenListAdapter } from "./openlist";
import { S3Adapter } from "./s3";
import { WebdavAdapter } from "./webdav";

// Mirrors the OpenList driver item types (`internal/conf/const.go:4-8`).
export const DRIVER_ITEM_TYPES = ["string", "number", "bool", "select", "text"] as const;

export type DriverItemType = (typeof DRIVER_ITEM_TYPES)[number];

// Mirrors OpenList's `driver.Item` (`internal/driver/item.go:7-14`). The admin
// UI builds the storage form from these instead of hard-coding fields, so a
// field only exists here if the adapter actually reads it.
export interface DriverItem {
	name: string;
	type: DriverItemType;
	default: string;
	/** Comma separated choices, used when `type` is `select`. */
	options?: string;
	required?: boolean;
	help?: string;
	/**
	 * Render as a password field. EdgeList-specific: OpenList's `Item` has no
	 * such flag, but a driver form that shows a secret in clear text is a
	 * mistake, and guessing from the field name would be a second source of
	 * truth for something the registry already knows.
	 */
	secret?: boolean;
}

// Mirrors OpenList's `driver.Config` (`internal/driver/config.go:3-29`). Flags
// EdgeList cannot act on yet are still declared, so a driver definition stays
// comparable with upstream and an imported backup keeps its meaning.
export interface DriverConfig {
	localSort?: boolean;
	onlyProxy?: boolean;
	noCache?: boolean;
	noUpload?: boolean;
	needMs?: boolean;
	defaultRoot?: string;
	noOverwriteUpload?: boolean;
	noLinkUrl?: boolean;
	preferProxy?: boolean;
	onlyIndices?: boolean;
}

export interface DriverDefinition {
	/** Driver key stored in `StorageConfig.driver`. */
	key: StorageDriver;
	/** OpenList driver name, used when talking to an upstream OpenList. */
	name: string;
	config: DriverConfig;
	additionalItems: DriverItem[];
	capabilities: ReadonlySet<StorageCapability>;
	checkStatus?: boolean;
	create: (config: StorageConfig) => StorageAdapter;
}

// Common items shared by every storage mount. Conditionally includes sort
// fields based on the driver's `localSort` flag. Fields that were removed
// during the Phase 0 cleanup (cache_expiration, custom_cache_policies,
// disable_index, enable_sign, web_proxy, down_proxy_url, disable_proxy_sign,
// webdav_policy) are intentionally absent: they were never implemented or
// their UI presence was a lie. They may reappear in Phase 8 when caching is
// added back.
function buildCommonItems(config: DriverConfig): DriverItem[] {
	const items: DriverItem[] = [
		{ name: "mount_path", type: "string", default: "", required: true, help: "Unique mount path for this storage" },
		{ name: "order", type: "number", default: "0", help: "Sort order when listing storages" },
		{ name: "remark", type: "text", default: "" },
	];
	if (config.localSort) {
		items.push(
			{
				name: "order_by",
				type: "select",
				default: "",
				options: "name,size,modified",
				help: "Primary sort key; empty means upstream order",
			},
			{ name: "order_direction", type: "select", default: "asc", options: "asc,desc" },
			{
				name: "extract_folder",
				type: "select",
				default: "front",
				options: "front,back",
				help: "Folders before files (front) or after (back)",
			},
		);
	}
	return items;
}

export function getDriverInfo(driver: DriverDefinition) {
	return {
		// `key` is what a storage stores in `StorageConfig.driver`; `name` is the
		// OpenList-facing label. The admin UI needs both: the key to match a
		// storage to its definition, the name to show a badge and to talk to an
		// upstream OpenList.
		key: driver.key,
		name: driver.name,
		config: driver.config,
		common: buildCommonItems(driver.config),
		additional: driver.additionalItems,
	};
}

// Field names follow what the adapters read, which is not always the upstream
// spelling: EdgeList uses `base_url`/`url` where OpenList uses `url`, and
// `url`/`address` for WebDAV. The aliases are noted in each item's help text.
// WebDAV's `skip_tls_verify` is deliberately absent: skipping certificate
// verification must stay off in the UI.
// `root_folder_path` is intentionally absent: the S3 adapter maps a path
// straight onto an object key and never prefixes it, so advertising the field
// would be another control that does nothing. See TODOLIST 3.13.
//
// The rule this list lives by: an item exists only if the adapter reads it, and
// `registry.test.ts` fails the build when one does not. That check is why the
// OpenList-inherited S3 extras — `custom_host`, `enable_custom_host_presign`,
// `sign_url_expire`, `placeholder`, `remove_bucket`,
// `add_filename_to_disposition`, `enable_direct_upload`, `direct_upload_host` —
// are gone: none of them was ever read, so every one of them was a form control
// that changed nothing. `normalizeStorageConfig` keeps unknown keys, so a backup
// still carries the values through untouched.
const S3_ITEMS: DriverItem[] = [
	{
		name: "endpoint",
		type: "string",
		default: "",
		required: true,
		help: "S3 API endpoint, for example https://s3.example.com",
	},
	{ name: "bucket", type: "string", default: "", required: true },
	{ name: "access_key_id", type: "string", default: "", required: true },
	{ name: "secret_access_key", type: "string", default: "", required: true, secret: true },
	{ name: "region", type: "string", default: "" },
	{ name: "session_token", type: "string", default: "", secret: true },
	{ name: "force_path_style", type: "bool", default: "false" },
	{ name: "list_object_version", type: "select", default: "v2", options: "v1,v2" },
];

const WEBDAV_ITEMS: DriverItem[] = [
	{
		name: "url",
		type: "string",
		default: "",
		required: true,
		help: "WebDAV address; `address` is accepted as an alias",
	},
	{ name: "username", type: "string", default: "" },
	{ name: "password", type: "string", default: "", secret: true },
	{ name: "root_folder_path", type: "string", default: "/" },
];

const OPENLIST_ITEMS: DriverItem[] = [
	{
		name: "base_url",
		type: "string",
		default: "",
		required: true,
		help: "Upstream OpenList address; `url` is accepted as an alias",
	},
	{ name: "token", type: "string", default: "", secret: true },
	{ name: "username", type: "string", default: "" },
	{ name: "password", type: "string", default: "", secret: true },
];

export const DRIVERS: readonly DriverDefinition[] = [
	{
		key: "object",
		name: "S3",
		config: { localSort: true, defaultRoot: "/" },
		additionalItems: S3_ITEMS,
		capabilities: new Set<StorageCapability>(["read", "write", "mkdir", "remove", "rename", "copy", "move", "merge"]),
		create: (config) => new S3Adapter(config),
	},
	{
		key: "webdav",
		name: "WebDav",
		config: { localSort: true, defaultRoot: "/", preferProxy: true },
		additionalItems: WEBDAV_ITEMS,
		capabilities: new Set<StorageCapability>(["read", "write", "mkdir", "remove", "rename", "copy", "move"]),
		create: (config) => new WebdavAdapter(config),
	},
	{
		key: "openlist",
		name: "OpenList",
		config: { localSort: true, defaultRoot: "/" },
		additionalItems: OPENLIST_ITEMS,
		capabilities: new Set<StorageCapability>(["read", "write", "mkdir", "remove", "rename", "copy", "move", "merge"]),
		create: (config) => new OpenListAdapter(config),
	},
];

// Accepts either an EdgeList driver key or the OpenList driver name, because
// backups and admin clients use both.
export function findDriver(driver: string): DriverDefinition | undefined {
	const value = driver.toLowerCase();
	return DRIVERS.find((item) => item.key === value || item.name.toLowerCase() === value);
}

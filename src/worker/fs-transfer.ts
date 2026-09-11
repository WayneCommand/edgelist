import type { FileObject, StorageAdapter, StorageConfig, TransferOptions } from "./storage/types";
import { joinPath, normalizePath, ObjMask } from "./storage/types";

export type TransferKind = "copy" | "move";

export interface TransferInput {
	src_dir?: string;
	dst_dir?: string;
	names?: unknown;
	overwrite?: boolean;
	skip_existing?: boolean;
	merge?: boolean;
}

export interface TransferItemResult {
	name: string;
	source: string;
	destination?: string;
	status: "accepted" | "skipped" | "failed";
	error?: string;
	code?: string;
}

export interface TransferResult {
	operation: TransferKind;
	results: TransferItemResult[];
	accepted: number;
	skipped: number;
	failed: number;
}

export interface ResolvedTransferStorage {
	config: StorageConfig;
	path: string;
	adapter: StorageAdapter;
}

export interface TransferPlannerDependencies {
	resolve(path: string): Promise<ResolvedTransferStorage>;
	isVirtualMount(path: string): Promise<boolean>;
	listVirtualMounts(path: string): Promise<FileObject[]>;
}

const MAX_TRANSFER_ITEMS = 100;

export class TransferValidationError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "TransferValidationError";
		this.code = code;
	}
}

function requireDirectoryPath(value: string | undefined, field: "src_dir" | "dst_dir"): string {
	const path = normalizePath(value ?? "/");
	if (value && typeof value !== "string")
		throw new TransferValidationError("INVALID_FIELD", `${field} must be a string`);
	return path;
}

function transferNames(value: unknown): string[] {
	if (!Array.isArray(value) || !value.length)
		throw new TransferValidationError("INVALID_FIELD", "names must be a non-empty array");
	if (value.length > MAX_TRANSFER_ITEMS)
		throw new TransferValidationError("TOO_MANY_ITEMS", `names cannot contain more than ${MAX_TRANSFER_ITEMS} items`);
	const names = value.map((item) => {
		if (typeof item !== "string") throw new TransferValidationError("INVALID_FIELD", "every name must be a string");
		const name = item.trim();
		if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) {
			throw new TransferValidationError("INVALID_NAME", `Invalid transfer name: ${item}`);
		}
		return name;
	});
	if (new Set(names).size !== names.length)
		throw new TransferValidationError("DUPLICATE_NAMES", "names must be unique");
	return names;
}

function notFoundError(error: unknown): boolean {
	return error instanceof Error && /not found/i.test(error.message);
}

async function findObject(adapter: StorageAdapter, path: string): Promise<FileObject | null> {
	try {
		return await adapter.get(path);
	} catch (error) {
		if (notFoundError(error)) return null;
		throw error;
	}
}

function transferOptions(
	kind: TransferKind,
	source: FileObject,
	target: FileObject | null,
	input: TransferInput,
	adapter: StorageAdapter,
): TransferOptions | "skip" {
	if (!target) return { overwrite: false, merge: false };
	if (input.skip_existing) return "skip";
	if (input.overwrite) return { overwrite: true, merge: false };
	if (kind === "copy" && input.merge && source.is_dir && target.is_dir && adapter.capabilities.has("merge"))
		return { overwrite: false, merge: true };
	throw new TransferValidationError("TARGET_EXISTS", "Target already exists");
}

export async function planTransfers(
	kind: TransferKind,
	input: TransferInput,
	dependencies: TransferPlannerDependencies,
): Promise<TransferResult> {
	const sourceDirectory = requireDirectoryPath(input.src_dir, "src_dir");
	const destinationDirectory = requireDirectoryPath(input.dst_dir, "dst_dir");
	const names = transferNames(input.names);
	if (await dependencies.isVirtualMount(destinationDirectory))
		throw new TransferValidationError("VIRTUAL_MOUNT", "Destination is a virtual mount directory");
	const destination = await dependencies.resolve(destinationDirectory);
	const destinationObject = await destination.adapter.get(destination.path);
	if (!destinationObject.is_dir) throw new TransferValidationError("NOT_DIRECTORY", "Destination is not a directory");

	const results: TransferItemResult[] = [];
	for (const name of names) {
		const sourcePath = joinPath(sourceDirectory, name);
		const targetPath = joinPath(destination.path, name);
		try {
			if (await dependencies.isVirtualMount(sourcePath))
				throw new TransferValidationError("VIRTUAL_MOUNT", "Virtual mount directories cannot be transferred");

			const source = await dependencies.resolve(sourcePath);
			if (source.config.mount_path !== destination.config.mount_path)
				throw new TransferValidationError("CROSS_STORAGE_TRANSFER", "跨存储复制/移动不支持");
			if (!source.adapter.capabilities.has(kind))
				throw new TransferValidationError(
					"UNSUPPORTED_OPERATION",
					`存储不支持${kind === "copy" ? "复制" : "移动"}操作`,
				);
			if (source.path === "/")
				throw new TransferValidationError("ROOT_TRANSFER", "A storage root cannot be transferred");

			const sourceObject = await source.adapter.get(source.path);
			if (sourceObject.mask) {
				const maskBit = kind === "copy" ? ObjMask.NoCopy : ObjMask.NoMove;
				if (sourceObject.mask & maskBit) {
					throw new TransferValidationError("MASK_RESTRICTED", `Cannot ${kind} this item`);
				}
				if (kind === "move" && sourceObject.mask & ObjMask.NoRemove) {
					throw new TransferValidationError("MASK_RESTRICTED", "Cannot remove this item");
				}
			}
			if (sourcePath === targetPath)
				throw new TransferValidationError("SAME_PATH", "Source and destination are the same");
			if (sourceObject.is_dir && targetPath.startsWith(`${sourcePath}/`))
				throw new TransferValidationError("NESTED_TRANSFER", "A directory cannot be transferred into itself");
			if (sourceObject.is_dir && (await dependencies.listVirtualMounts(sourcePath)).length) {
				throw new TransferValidationError(
					"MOUNTED_DIRECTORY",
					"A directory containing mounted storages cannot be transferred synchronously",
				);
			}

			const targetResolution = await dependencies.resolve(targetPath);
			if (targetResolution.config.mount_path !== source.config.mount_path)
				throw new TransferValidationError("CROSS_STORAGE_TRANSFER", "跨存储复制/移动不支持");
			if (targetResolution.path === "/")
				throw new TransferValidationError("OVERWRITE_MOUNT", "A storage mount cannot be overwritten");
			const target = await findObject(targetResolution.adapter, targetPath);
			if (target?.mask && target.mask & ObjMask.NoWrite) {
				throw new TransferValidationError("MASK_RESTRICTED", "Cannot write to target");
			}
			const options = transferOptions(kind, sourceObject, target, input, source.adapter);
			if (options === "skip") {
				results.push({ name, source: sourcePath, destination: targetPath, status: "skipped" });
				continue;
			}
			await source.adapter[kind](source.path, targetPath, options);
			results.push({ name, source: sourcePath, destination: targetPath, status: "accepted" });
		} catch (error) {
			results.push({
				name,
				source: sourcePath,
				destination: targetPath,
				status: "failed",
				error: error instanceof Error ? error.message : "Transfer failed",
				code: error instanceof TransferValidationError ? error.code : undefined,
			});
		}
	}

	return {
		operation: kind,
		results,
		accepted: results.filter((result) => result.status === "accepted").length,
		skipped: results.filter((result) => result.status === "skipped").length,
		failed: results.filter((result) => result.status === "failed").length,
	};
}

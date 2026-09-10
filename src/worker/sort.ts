import type { FileObject } from "./storage/types";

export interface SortSettings {
	orderBy: string;
	orderDirection: string;
	extractFolder: string;
}

export const DEFAULT_SORT: SortSettings = { orderBy: "name", orderDirection: "asc", extractFolder: "front" };

function pick(request: unknown, storage: unknown, fallback: string): string {
	for (const candidate of [request, storage]) if (typeof candidate === "string") return candidate;
	return fallback;
}

// A client may override the sort for a single request. Otherwise the storage the
// path resolved to decides, and whatever it leaves unset falls back to the
// defaults. An empty string is a meaningful OpenList value ("keep the upstream
// order"), so it is honoured rather than replaced.
export function resolveSort(request: Record<string, unknown> = {}, storage?: Record<string, unknown>): SortSettings {
	return {
		orderBy: pick(request.order_by, storage?.order_by, DEFAULT_SORT.orderBy),
		orderDirection: pick(request.order_direction, storage?.order_direction, DEFAULT_SORT.orderDirection),
		extractFolder: pick(request.extract_folder, storage?.extract_folder, DEFAULT_SORT.extractFolder),
	};
}

// Splits a name into alternating text and number runs, so `file-2` sorts before
// `file-10` the way a person would expect instead of comparing character by
// character.
function naturalChunks(value: string): Array<string | number> {
	const chunks: Array<string | number> = [];
	for (const [text] of value.matchAll(/\d+|\D+/g)) {
		chunks.push(/^\d+$/.test(text) ? Number(text) : text);
	}
	return chunks;
}

// Natural ordering, OpenList style. Text runs compare by code point so the
// result never depends on the runtime locale.
export function compareNatural(left: string, right: string): number {
	const leftChunks = naturalChunks(left);
	const rightChunks = naturalChunks(right);
	for (let index = 0; index < Math.max(leftChunks.length, rightChunks.length); index += 1) {
		const leftChunk = leftChunks[index];
		const rightChunk = rightChunks[index];
		if (leftChunk === undefined) return -1;
		if (rightChunk === undefined) return 1;
		if (typeof leftChunk === "number" && typeof rightChunk === "number") {
			if (leftChunk !== rightChunk) return leftChunk - rightChunk;
			continue;
		}
		if (typeof leftChunk === "number" || typeof rightChunk === "number") return typeof leftChunk === "number" ? -1 : 1;
		if (leftChunk !== rightChunk) return leftChunk < rightChunk ? -1 : 1;
	}
	return 0;
}

function timestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

// Sorts by `name`, `size` or `modified`. An empty `orderBy` means "keep the
// order the storage returned", which is what OpenList does too.
export function sortObjects(items: readonly FileObject[], orderBy: string, orderDirection: string): FileObject[] {
	if (!orderBy) return [...items];
	const direction = orderDirection === "desc" ? -1 : 1;
	return [...items].sort((left, right) => {
		switch (orderBy) {
			case "size": return (left.size - right.size) * direction;
			case "modified": return (timestamp(left.modified) - timestamp(right.modified)) * direction;
			default: return compareNatural(left.name, right.name) * direction;
		}
	});
}

// Moves directories to the front (`front`) or the back (anything else). The
// sort is stable, so entries keep whatever order `sortObjects` produced.
export function extractFolder(items: readonly FileObject[], position: string): FileObject[] {
	if (!position) return [...items];
	const front = position === "front";
	return [...items].sort((left, right) => {
		if (left.is_dir === right.is_dir) return 0;
		return left.is_dir === front ? -1 : 1;
	});
}

// OpenList sorts first, then pulls folders to one end, so that is the order to
// apply: it keeps the chosen ordering intact inside each group.
export function applySort(items: readonly FileObject[], settings: SortSettings): FileObject[] {
	return extractFolder(sortObjects(items, settings.orderBy, settings.orderDirection), settings.extractFolder);
}

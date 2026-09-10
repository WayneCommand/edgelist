import type { FileObject } from "./storage/types";

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

import type { TransferResult } from "./types";

/**
 * The storage that serves `path`, as a mount path.
 *
 * Mounts form a virtual tree resolved by longest prefix, exactly like the
 * worker's own `resolveStorage`, so `/a/b` belongs to the mount `/a` rather
 * than to a sibling mount `/a-b` — the boundary is a separator, not a string
 * prefix.
 */
export function mountPathFor(path: string, mounts: readonly string[]): string | null {
	let best: string | null = null;
	for (const mount of mounts) {
		const candidate = mount === "/" ? "/" : mount.replace(/\/+$/, "");
		const matches = candidate === "/" || path === candidate || path.startsWith(`${candidate}/`);
		if (!matches) continue;
		if (best === null || candidate.length > best.length) best = candidate;
	}
	return best;
}

/**
 * Why a transfer between two storages is refused, or `null` when it is allowed.
 *
 * Workers cannot stream between two drivers without buffering the whole object,
 * and a large one would blow the request budget, so the API refuses with
 * `CROSS_STORAGE_TRANSFER`. Saying so up front beats letting the user pick a
 * destination that is guaranteed to fail.
 */
export function crossStorageHint(sourceMount: string | null, destinationMount: string | null): string | null {
	if (!sourceMount || !destinationMount || sourceMount === destinationMount) return null;
	return `跨存储复制/移动不支持：${sourceMount} → ${destinationMount}`;
}

/** One line for the toast, plus whether it should be reported as a failure. */
export function summarizeTransfer(result: TransferResult): { message: string; error: boolean } {
	const verb = result.operation === "copy" ? "Copied" : "Moved";
	const parts: string[] = [];
	if (result.accepted) parts.push(`${result.accepted} ${result.accepted === 1 ? "item" : "items"}`);
	if (result.skipped) parts.push(`${result.skipped} skipped`);
	if (result.failed) parts.push(`${result.failed} failed`);
	const detail = parts.join(", ");
	return {
		message: result.accepted ? `${verb} ${detail}` : detail || "Nothing to do",
		error: result.failed > 0,
	};
}

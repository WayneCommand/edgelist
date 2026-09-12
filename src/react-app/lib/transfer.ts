import { t, tCount } from "./locale";
import { isMountLayer } from "./mask";
import type { TransferResult } from "./types";

/**
 * A mount path in the form `mountPathFor` compares: no trailing slash, and `/`
 * stays `/` rather than becoming empty. Exported because callers that keep a
 * list of mounts of their own have to spell them the same way, or a mount that
 * matches here would fail to match there.
 */
export function normalizeMountPath(mount: string): string {
	return mount === "/" ? "/" : mount.replace(/\/+$/, "");
}

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
		const candidate = normalizeMountPath(mount);
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
	return t("transfer.crossStorage", { from: sourceMount, to: destinationMount });
}

/**
 * Why a directory cannot receive new entries, or `null` when it can.
 *
 * `mounts` is `null` while the list is unknown — a failed read is not the same
 * answer as "nothing is mounted", and treating it as the latter would lock every
 * write button in the app on a transient error, so unknown stays permissive and
 * the server has the final say.
 *
 * When the list is known the test mirrors the worker's `resolveStorage`: it
 * matches the path or one of its ancestors, and no match means the worker would
 * answer "Storage not found". That is exactly the root case — the root is an
 * aggregate over the mounts beneath it rather than a storage itself, so creating
 * or uploading there always fails.
 *
 * The remaining way a write fails, a `NoWrite` mask or a Meta rule on a real
 * storage, is only knowable server-side, which answers 403.
 *
 * Note what this deliberately does *not* do: it never blocks a path the worker
 * would accept. An intermediate mount level that a parent storage still serves
 * stays writable here, because `fsMkdir` resolves it to that parent and would
 * succeed — only the message changes, since "no storage is mounted here" reads
 * as a contradiction when the folder is sitting in the listing.
 */
export function unwritableHint(path: string, mounts: readonly string[] | null): string | null {
	if (!mounts) return null;
	if (mountPathFor(path, mounts)) return null;
	// A level that only exists to reach a nested mount is the usual reason a
	// listing shows a folder with nowhere to put a file. The root is the same
	// idea — it prefixes every mount — but it reads better named as itself.
	if (path !== "/" && isMountLayer(path, mounts)) return t("transfer.mountLayer", { path });
	return t("transfer.noMount", { path });
}

/**
 * Why a transfer into `destination` is refused, or `null` when it is allowed.
 *
 * Every case here is one the worker would also refuse, but a dialog that opens
 * with an impossible destination and only explains itself after the request is
 * worse than one that says so while the choice is still being made.
 */
export function destinationHint(srcDir: string, destination: string, mounts: readonly string[] | null): string | null {
	if (destination === srcDir) return t("transfer.sameFolder");
	// From the root every path is "inside" it, so the nesting check only carries
	// meaning below a real directory.
	if (srcDir !== "/" && destination.startsWith(`${srcDir.replace(/\/+$/, "")}/`)) {
		return t("transfer.insideItself");
	}
	const sourceMount = mounts ? mountPathFor(srcDir, mounts) : null;
	const destinationMount = mounts ? mountPathFor(destination, mounts) : null;
	return crossStorageHint(sourceMount, destinationMount) ?? unwritableHint(destination, mounts);
}

/** One line for the toast, plus whether it should be reported as a failure. */
export function summarizeTransfer(result: TransferResult): { message: string; error: boolean } {
	const parts: string[] = [];
	if (result.accepted) parts.push(tCount(result.accepted, "transfer.itemsOne", "transfer.itemsOther"));
	if (result.skipped) parts.push(t("transfer.skipped", { count: result.skipped }));
	if (result.failed) parts.push(t("transfer.failedCount", { count: result.failed }));
	const detail = parts.join(", ");
	return {
		message: result.accepted
			? t(result.operation === "copy" ? "transfer.copied" : "transfer.moved", { detail })
			: detail || t("transfer.nothingToDo"),
		error: result.failed > 0,
	};
}

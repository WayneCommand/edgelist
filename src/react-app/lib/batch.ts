import { t, tCount } from "./locale";
import { parentOf } from "./paths";

export type BatchFailure = { name: string; error: string };
export type BatchResult = { done: number; failed: BatchFailure[] };

/** Shape returned by `fs/remove`: the backend keeps going when one name fails. */
export type RemoveOutcome = { removed?: string[]; failed?: BatchFailure[] };

export function collectRemovals(settled: PromiseSettledResult<RemoveOutcome>[]): BatchResult {
	const result: BatchResult = { done: 0, failed: [] };
	for (const entry of settled) {
		if (entry.status === "fulfilled") {
			result.done += entry.value.removed?.length ?? 0;
			result.failed.push(...(entry.value.failed ?? []));
		} else {
			result.failed.push({
				name: "?",
				error: entry.reason instanceof Error ? entry.reason.message : "Request failed",
			});
		}
	}
	return result;
}

/**
 * A batch can partly succeed, so the toast has to say both halves.
 *
 * There is no `noun` or `verb` parameter. The noun phrase is composed here from
 * the catalogue's own two forms and the whole sentence comes from one entry, so
 * a caller never supplies a word that only makes sense in English word order.
 */
export function summarizeBatch(result: BatchResult): { message: string; error: boolean } {
	const detail = tCount(result.done, "batch.itemsOne", "batch.itemsOther");
	if (!result.failed.length) return { message: t("batch.done", { detail }), error: false };
	if (!result.done) return { message: result.failed[0].error, error: true };
	return {
		message: t("batch.partial", { detail, failed: result.failed.length, error: result.failed[0].error }),
		error: true,
	};
}

/** Groups entries by parent directory, so search results still delete correctly. */
export function groupByParent<T extends { name: string; path: string }>(items: T[]): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const item of items) {
		const dir = parentOf(item.path);
		groups.set(dir, [...(groups.get(dir) ?? []), item.name]);
	}
	return groups;
}

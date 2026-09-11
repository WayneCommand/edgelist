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

function plural(count: number, noun: string) {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** A batch can partly succeed, so the toast has to say both halves. */
export function summarizeBatch(
	result: BatchResult,
	noun: string,
	verb = "deleted",
): { message: string; error: boolean } {
	if (!result.failed.length) return { message: `${plural(result.done, noun)} ${verb}`, error: false };
	if (!result.done) return { message: result.failed[0].error, error: true };
	return {
		message: `${plural(result.done, noun)} ${verb}, ${result.failed.length} failed: ${result.failed[0].error}`,
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

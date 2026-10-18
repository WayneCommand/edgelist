/**
 * Multi-selection over a listing, with §4.6's Shift semantics.
 *
 * The state is three things, not one: the set of selected paths, an **anchor** and
 * an **end**. That is what makes a Shift range behave the way a file manager's
 * does — the second Shift click replaces the previous range instead of adding to
 * it — and it is why this is not a `Set` in `useState` with a `lastIndex` beside
 * it. §4.6 spells the algorithm out; the comments below are only about why each
 * step is there.
 *
 * Identity is the path, so a refresh that returns the same entries keeps the
 * selection and entries that disappeared simply drop out. A search that changes
 * the listing entirely therefore clears it, which is the right answer.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { FileObject } from "../lib/types";

export type Selection = {
	/** Selected entries, in the order the list shows them. */
	items: FileObject[];
	paths: ReadonlySet<string>;
	count: number;
	folders: number;
	files: number;
	isSelected: (path: string) => boolean;
	/** Toggles one entry, extending from the anchor when `extend` is set. */
	toggle: (path: string, index: number, extend?: boolean) => void;
	/** Replaces the selection with one entry. */
	selectOnly: (path: string, index: number) => void;
	/** Selects an explicit set, e.g. the result of a rectangle drag. */
	selectMany: (paths: readonly string[]) => void;
	toggleAll: () => void;
	clear: () => void;
	allSelected: boolean;
	someSelected: boolean;
};

export function useSelection(items: readonly FileObject[]): Selection {
	const [paths, setPaths] = useState<ReadonlySet<string>>(() => new Set<string>());
	// The anchor is where a range starts; the end is where the live range
	// currently finishes. Both are list positions, not paths, so they survive a
	// rename-free reorder and a re-sort invalidates them harmlessly.
	const anchor = useRef<number>(-1);
	const end = useRef<number>(-1);

	const clear = useCallback(() => {
		setPaths(new Set<string>());
		anchor.current = -1;
		end.current = -1;
	}, []);

	/**
	 * §4.6's `selectIndex(index, checked, one?)`.
	 *
	 * With Shift held: find an anchor if there is none by scanning outward from the
	 * target for a selected entry, drop the old range, then select the new one. The
	 * two steps are what makes dragging the range around work — without dropping
	 * the old interval first, a range that shrinks would leave its outer edge
	 * selected forever.
	 */
	const selectIndex = useCallback(
		(index: number, checked: boolean, extend: boolean, one: boolean) => {
			const target = items[index];
			if (!target) return;
			setPaths((current) => {
				const next = new Set(one ? [] : current);
				if (extend) {
					let start = anchor.current;
					if (start < 0) {
						// No anchor yet: the nearest selected entry is the one the
						// range grows from, so the first Shift click after a plain
						// click does what the user expects.
						for (let step = 1; step < items.length && start < 0; step += 1) {
							if (next.has(items[index - step]?.path ?? "")) start = index - step;
							else if (next.has(items[index + step]?.path ?? "")) start = index + step;
						}
						if (start < 0) start = index;
						anchor.current = start;
						end.current = start;
					}
					// Deselect the old interval, then select the new one. Both ends
					// are inclusive, which is what "from A to B" means.
					const previousEnd = end.current;
					if (previousEnd >= 0) {
						const low = Math.min(anchor.current, previousEnd);
						const high = Math.max(anchor.current, previousEnd);
						for (let step = low; step <= high; step += 1) {
							const path = items[step]?.path;
							if (path) next.delete(path);
						}
					}
					const low = Math.min(anchor.current, index);
					const high = Math.max(anchor.current, index);
					for (let step = low; step <= high; step += 1) {
						const path = items[step]?.path;
						if (path) next.add(path);
					}
					end.current = index;
					return next;
				}
				if (checked) {
					next.add(target.path);
					anchor.current = index;
					end.current = index;
				} else {
					next.delete(target.path);
					// A plain deselect resets both, so the next Shift click has to
					// find an anchor again rather than extending from a gap.
					anchor.current = -1;
					end.current = -1;
				}
				return next;
			});
		},
		[items],
	);

	const toggle = useCallback(
		(path: string, index: number, extend = false) => {
			selectIndex(index, !paths.has(path) || extend, extend, false);
		},
		[paths, selectIndex],
	);

	const selectOnly = useCallback(
		(path: string, index: number) => {
			setPaths(new Set([path]));
			anchor.current = index;
			end.current = index;
		},
		[],
	);

	const selectMany = useCallback((next: readonly string[]) => {
		setPaths(new Set(next));
		anchor.current = -1;
		end.current = -1;
	}, []);

	const toggleAll = useCallback(() => {
		setPaths((current) => (current.size === items.length ? new Set<string>() : new Set(items.map((item) => item.path))));
		anchor.current = -1;
		end.current = -1;
	}, [items]);

	const selected = useMemo(() => items.filter((item) => paths.has(item.path)), [items, paths]);
	const folders = useMemo(() => selected.filter((item) => item.is_dir).length, [selected]);

	return {
		items: selected,
		paths,
		count: selected.length,
		folders,
		files: selected.length - folders,
		isSelected: (path: string) => paths.has(path),
		toggle,
		selectOnly,
		selectMany,
		toggleAll,
		clear,
		allSelected: items.length > 0 && selected.length === items.length,
		someSelected: selected.length > 0 && selected.length < items.length,
	};
}

import { useCallback, useMemo, useRef, useState } from "react";
import type { FileItem } from "../lib/types";

export type Selection = {
	/** Selected entries, in the order the list currently shows them. */
	items: FileItem[];
	paths: ReadonlySet<string>;
	count: number;
	isSelected: (path: string) => boolean;
	/** Clicking a row's checkbox toggles it; Shift extends from the last anchor. */
	toggle: (item: FileItem, index: number, extend?: boolean) => void;
	/** Clicking a row body replaces the selection with that row, Explorer-style. */
	selectOnly: (item: FileItem, index: number) => void;
	/** Toggles every visible entry. */
	toggleAll: () => void;
	clear: () => void;
	allSelected: boolean;
	someSelected: boolean;
};

/** Every path between two list positions, inclusive, in list order. */
export function rangePaths(visible: FileItem[], anchor: number, index: number): string[] {
	const start = Math.min(anchor, index);
	const end = Math.max(anchor, index);
	return visible.slice(start, end + 1).map((item) => item.path);
}

/**
 * Multi-selection for the file list. Paths are the identity, so a refresh that
 * returns the same entries keeps the selection; entries that disappeared simply
 * drop out of `items`.
 */
export function useSelection(visible: FileItem[]): Selection {
	const [paths, setPaths] = useState<ReadonlySet<string>>(() => new Set<string>());
	const anchor = useRef<number | null>(null);

	const clear = useCallback(() => {
		setPaths(new Set<string>());
		anchor.current = null;
	}, []);

	const toggle = useCallback(
		(item: FileItem, index: number, extend = false) => {
			setPaths((current) => {
				const next = new Set(current);
				if (extend && anchor.current !== null) {
					for (const path of rangePaths(visible, anchor.current, index)) next.add(path);
					return next;
				}
				if (next.has(item.path)) next.delete(item.path);
				else next.add(item.path);
				return next;
			});
			if (!extend) anchor.current = index;
		},
		[visible],
	);

	const selectOnly = useCallback((item: FileItem, index: number) => {
		setPaths(new Set([item.path]));
		anchor.current = index;
	}, []);

	const toggleAll = useCallback(() => {
		setPaths((current) => (current.size === visible.length ? new Set<string>() : new Set(visible.map((i) => i.path))));
		anchor.current = null;
	}, [visible]);

	const items = useMemo(() => visible.filter((item) => paths.has(item.path)), [visible, paths]);

	return {
		items,
		paths,
		count: items.length,
		isSelected: (path: string) => paths.has(path),
		toggle,
		selectOnly,
		toggleAll,
		clear,
		allSelected: visible.length > 0 && items.length === visible.length,
		someSelected: items.length > 0 && items.length < visible.length,
	};
}

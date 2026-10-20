import type { LayoutMode } from "../lib/preferences";

/**
 * What a directory looks like while it is loading.
 *
 * A skeleton rather than a spinner, because the two answer different questions. A
 * spinner says "something is happening"; a skeleton says "a list is about to appear
 * here, with these columns and this many rows", and the page does not jump when the
 * real rows land. That is the whole point of it: the shape is the message.
 *
 * The geometry is copied from the real views rather than approximated — the same
 * `px-3 py-2` rows, the same 92px and 148px columns, the same 38px height — so the
 * only thing that changes on load is the content.
 *
 * `aria-hidden` throughout, with one `role="status"` label on the container: a
 * screen reader should hear "Loading" once, not fourteen times.
 */
export function FileListSkeleton({ rows = 8, checkbox = false }: { rows?: number; checkbox?: boolean }) {
	return (
		<div role="status" aria-label="Loading" className="flex w-full flex-col">
			<div className="flex w-full items-center gap-3 border-b border-hairline bg-neutral-3/40 px-3 py-1.5">
				<div className="flex min-w-0 flex-1 items-center gap-2.5">
					{checkbox && <div className="skeleton size-4 rounded-[5px]" />}
					<div className="skeleton h-2.5 w-12 rounded-full" />
				</div>
				<div className="skeleton hidden h-2.5 w-8 rounded-full md:block" />
				<div className="skeleton ml-[92px] hidden h-2.5 w-14 rounded-full md:block" />
			</div>
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex items-center gap-3 px-3 py-2" aria-hidden="true">
					<div className="flex min-w-0 flex-1 items-center gap-2.5">
						{checkbox && <div className="skeleton size-4 rounded-[5px]" />}
						{/* The icon and the name are one row; the name's width varies a
						    little per row so the block does not look like a barcode. */}
						<div className="skeleton size-[1.15rem] shrink-0 rounded-md" />
						<div className="skeleton h-3 rounded-full" style={{ width: `${38 + ((index * 17) % 34)}%` }} />
					</div>
					<div className="hidden w-[92px] shrink-0 justify-end md:flex">
						<div className="skeleton h-2.5 w-10 rounded-full" />
					</div>
					<div className="hidden w-[148px] shrink-0 justify-end md:flex">
						<div className="skeleton h-2.5 w-24 rounded-full" />
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * The grid and gallery layouts' skeleton.
 *
 * The tile is the same `itemSize + 20` minimum as the real grid, so the columns land
 * in the same places and switching from skeleton to content does not reflow.
 */
export function FileGridSkeleton({ itemSize = 90, rows = 12 }: { itemSize?: number; rows?: number }) {
	return (
		<div
			role="status"
			aria-label="Loading"
			className="grid w-full gap-1 p-1"
			style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${itemSize + 20}px, 1fr))` }}
		>
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex flex-col items-center gap-1 p-1" aria-hidden="true">
					<div className="skeleton w-full rounded-lg" style={{ height: itemSize }} />
					<div className="skeleton h-2.5 rounded-full" style={{ width: `${45 + ((index * 13) % 40)}%` }} />
				</div>
			))}
		</div>
	);
}

/** Whichever skeleton matches the layout that is about to be drawn. */
export function DirectorySkeleton({
	layout,
	itemSize,
	checkbox,
}: {
	layout: LayoutMode;
	itemSize: number;
	checkbox: boolean;
}) {
	if (layout === "list") return <FileListSkeleton checkbox={checkbox} />;
	return <FileGridSkeleton itemSize={itemSize} />;
}

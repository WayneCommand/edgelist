import { useT } from "../../hooks/useLocale";
import { fileDescription, fileGlyph } from "../../lib/format";
import type { FileItem } from "../../lib/types";
import type { Selection } from "../../hooks/useSelection";
import type { MenuPosition } from "../../lib/menu";

type FileGridProps = {
	items: FileItem[];
	selection: Selection;
	onOpen: (item: FileItem) => void;
	onContextMenu: (item: FileItem, index: number, position: MenuPosition) => void;
};

/** Tile layout for the same entries the table shows, for image-heavy folders. */
export function FileGrid({ items, selection, onOpen, onContextMenu }: FileGridProps) {
	return (
		<div role="grid" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
			{items.map((item, index) => (
				<FileTile
					key={item.path}
					item={item}
					index={index}
					selection={selection}
					onOpen={onOpen}
					onContextMenu={onContextMenu}
				/>
			))}
		</div>
	);
}

type FileTileProps = {
	item: FileItem;
	index: number;
	selection: Selection;
	onOpen: (item: FileItem) => void;
	onContextMenu: (item: FileItem, index: number, position: MenuPosition) => void;
};

function FileTile({ item, index, selection, onOpen, onContextMenu }: FileTileProps) {
	const t = useT();
	const selected = selection.isSelected(item.path);
	return (
		<div
			role="row"
			tabIndex={0}
			aria-selected={selected}
			// The tile sits on the card's surface, not on the page background, so
			// the ring is drawn without an offset rather than borrowing HeroUI's
			// `status-focused`, whose offset colour would show as a halo here.
			className={`tint group relative flex cursor-default flex-col items-center gap-2 rounded-lg border p-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-focus ${
				selected ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-secondary"
			}`}
			onClick={() => selection.selectOnly(item, index)}
			onDoubleClick={() => onOpen(item)}
			onContextMenu={(event) => {
				event.preventDefault();
				onContextMenu(item, index, { x: event.clientX, y: event.clientY });
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") onOpen(item);
				if (event.key === " ") {
					event.preventDefault();
					selection.toggle(item, index, event.shiftKey);
				}
			}}
		>
			{/* Kept out of the way until the tile is hovered, selected or tabbed to.
			    `group-focus-within` rather than `focus`: the tile is what takes the
			    tab stop, so a `focus:` on the checkbox itself only ever fired for
			    the mouse. Opacity and scale only, because a tile is hovered
			    constantly and a 300ms blur-in would charge that cost every time. */}
			<input
				type="checkbox"
				checked={selected}
				readOnly
				aria-label={t("table.select", { name: item.name })}
				className={`absolute top-2 left-2 h-4 w-4 transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none ${
					selected
						? "scale-100 opacity-100"
						: "scale-[0.25] opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
				}`}
				onClick={(event) => {
					event.stopPropagation();
					selection.toggle(item, index, event.shiftKey);
				}}
			/>
			<span className="text-4xl">{fileGlyph(item)}</span>
			<span className="w-full truncate text-sm font-medium">{item.name}</span>
			<span className="text-xs text-muted">{fileDescription(item, t)}</span>
		</div>
	);
}

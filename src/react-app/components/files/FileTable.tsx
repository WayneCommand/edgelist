import { formatSize } from "../../lib/format";
import type { FileItem } from "../../lib/types";
import type { Selection } from "../../hooks/useSelection";

type FileTableProps = {
	items: FileItem[];
	selection: Selection;
	onOpen: (item: FileItem) => void;
};

/**
 * Explorer-style rows: clicking the body selects that row alone, the checkbox
 * toggles, Shift extends from the last anchor, and a double click opens.
 */
export function FileTable({ items, selection, onOpen }: FileTableProps) {
	return (
		<div role="grid">
			{items.map((item, index) => (
				<FileRow key={item.path} item={item} index={index} selection={selection} onOpen={onOpen} />
			))}
		</div>
	);
}

type FileRowProps = {
	item: FileItem;
	index: number;
	selection: Selection;
	onOpen: (item: FileItem) => void;
};

function FileRow({ item, index, selection, onOpen }: FileRowProps) {
	const selected = selection.isSelected(item.path);
	return (
		<div
			role="row"
			tabIndex={0}
			aria-selected={selected}
			className={`flex cursor-default items-center gap-4 border-b border-separator px-5 py-4 outline-none last:border-0 ${
				selected ? "bg-accent-soft" : "hover:bg-surface-secondary"
			}`}
			onClick={() => selection.selectOnly(item, index)}
			onDoubleClick={() => onOpen(item)}
			onKeyDown={(event) => {
				if (event.key === "Enter") onOpen(item);
				if (event.key === " ") {
					event.preventDefault();
					selection.toggle(item, index, event.shiftKey);
				}
			}}
		>
			<input
				type="checkbox"
				checked={selected}
				readOnly
				aria-label={`Select ${item.name}`}
				className="h-4 w-4 shrink-0"
				onClick={(event) => {
					event.stopPropagation();
					selection.toggle(item, index, event.shiftKey);
				}}
			/>
			<span className="text-2xl">{item.is_dir ? "📁" : "📄"}</span>
			<span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
			<span className="hidden w-32 text-right text-xs text-muted sm:block">
				{item.is_dir ? "Folder" : formatSize(item.size)}
			</span>
			<span className="hidden w-36 text-right text-xs text-muted md:block">
				{item.modified ? new Date(item.modified).toLocaleDateString() : "—"}
			</span>
		</div>
	);
}

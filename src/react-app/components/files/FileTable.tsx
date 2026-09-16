import { useT } from "../../hooks/useLocale";
import { fileDescription, fileGlyph } from "../../lib/format";
import type { MenuPosition } from "../../lib/menu";
import { DEFAULT_SORT_STATE } from "../../lib/preferences";
import type { FileItem, SortField, SortState } from "../../lib/types";
import type { Selection } from "../../hooks/useSelection";

type FileTableProps = {
	items: FileItem[];
	selection: Selection;
	/** Omitted while searching: the server ranks results, so nothing is sortable. */
	sort?: SortState;
	onSort?: (field: SortField) => void;
	onOpen: (item: FileItem) => void;
	onContextMenu: (item: FileItem, index: number, position: MenuPosition) => void;
};

/**
 * Explorer-style rows: clicking the body selects that row alone, the checkbox
 * toggles, Shift extends from the last anchor, and a double click opens. The
 * header cells re-sort, which the server applies — the client never reorders a
 * page it only partially received.
 */
export function FileTable({ items, selection, sort, onSort, onOpen, onContextMenu }: FileTableProps) {
	const t = useT();
	return (
		<div role="grid">
			<div
				role="row"
				className="flex items-center gap-4 border-b border-separator bg-surface-secondary px-5 py-2 text-xs text-muted"
			>
				<span className="h-4 w-4 shrink-0" />
				<span className="w-8 shrink-0" aria-hidden="true" />
				<SortableHeader field="name" label={t("table.name")} className="min-w-0 flex-1" sort={sort} onSort={onSort} />
				<SortableHeader
					field="size"
					label={t("table.size")}
					className="hidden w-32 sm:flex"
					align="end"
					sort={sort}
					onSort={onSort}
				/>
				<SortableHeader
					field="modified"
					label={t("table.modified")}
					className="hidden w-36 md:flex"
					align="end"
					sort={sort}
					onSort={onSort}
				/>
			</div>
			{items.map((item, index) => (
				<FileRow
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

type SortableHeaderProps = {
	field: SortField;
	label: string;
	className: string;
	align?: "start" | "end";
	sort?: SortState;
	onSort?: (field: SortField) => void;
};

function SortableHeader({ field, label, className, align = "start", sort, onSort }: SortableHeaderProps) {
	const state = sort ?? DEFAULT_SORT_STATE;
	const active = sort?.field === field;
	const arrow = active ? (state.direction === "asc" ? "↑" : "↓") : "";
	const ariaSort = active ? (state.direction === "asc" ? "ascending" : "descending") : "none";
	return (
		<span role="columnheader" aria-sort={ariaSort} className={`${className} ${align === "end" ? "justify-end" : ""}`}>
			{onSort ? (
				<button
					type="button"
					onClick={() => onSort(field)}
					className={`tint flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground ${
						active ? "font-semibold text-foreground" : ""
					}`}
				>
					{label}
					<span aria-hidden="true" className="w-3">
						{arrow}
					</span>
				</button>
			) : (
				<span className="px-1 py-0.5">{label}</span>
			)}
		</span>
	);
}

type FileRowProps = {
	item: FileItem;
	index: number;
	selection: Selection;
	onOpen: (item: FileItem) => void;
	onContextMenu: (item: FileItem, index: number, position: MenuPosition) => void;
};

function FileRow({ item, index, selection, onOpen, onContextMenu }: FileRowProps) {
	const t = useT();
	const selected = selection.isSelected(item.path);
	return (
		<div
			role="row"
			tabIndex={0}
			aria-selected={selected}
			className={`tint flex cursor-default items-center gap-4 border-b border-separator px-5 py-4 outline-none last:border-0 ${
				selected ? "bg-accent-soft" : "hover:bg-surface-secondary"
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
			<input
				type="checkbox"
				checked={selected}
				readOnly
				aria-label={t("table.select", { name: item.name })}
				className="h-4 w-4 shrink-0"
				onClick={(event) => {
					event.stopPropagation();
					selection.toggle(item, index, event.shiftKey);
				}}
			/>
			<span className="w-8 shrink-0 text-center text-2xl" aria-hidden="true">
				{fileGlyph(item)}
			</span>
			<span role="gridcell" className="min-w-0 flex-1 truncate text-sm font-medium">
				{item.name}
			</span>
			<span role="gridcell" className="hidden w-32 text-right text-xs text-muted sm:block">
				{fileDescription(item, t)}
			</span>
			<span role="gridcell" className="hidden w-36 text-right text-xs text-muted md:block">
				{item.modified ? new Date(item.modified).toLocaleDateString() : "—"}
			</span>
		</div>
	);
}

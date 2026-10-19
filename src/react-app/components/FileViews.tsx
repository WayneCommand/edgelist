import { memo, useCallback } from "react";
import type { FileObject } from "../lib/types";
import type { Permissions } from "../lib/permissions";
import { isLocked, isMountPoint } from "../lib/permissions";
import { formatDate, formatSize, kindOf } from "../lib/format";
import type { FilenameOverflow, SortState } from "../lib/preferences";
import { useT } from "../hooks/useStore";
import type { Selection } from "../hooks/useSelection";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/ActionButton";
import { Checkbox } from "../ui/Field";
import { Thumbnail, isPicture, kindIcon } from "./Thumbnail";

/**
 * The three directory layouts (§4.1, §4.3, §4.5) and the click semantics they share
 * (§4.6).
 *
 * The click handler is the part worth reading carefully, because the spec is
 * explicit that it is a six-step decision and not a plain `onClick`:
 *
 * 1. prevent the default;
 * 2. in `dblclick` mode a single click does *nothing* — not "selects", nothing;
 * 3. a modifier key (`Ctrl`/`⌘`/`Shift`) falls through to the browser, so
 *    middle-click and `⌘`-click can still open a new tab;
 * 4. `disable_while_checked` mode toggles the entry when anything is selected;
 * 5. otherwise navigate.
 *
 * The double click is a separate branch: it selects only that entry, then opens it.
 *
 * Every view takes the same `ItemHandlers`, so the three layouts cannot disagree
 * about what a click does — which is the failure mode of writing three views.
 */

export type ItemHandlers = {
	onOpen: (item: FileObject) => void;
	onContextMenu: (item: FileObject, index: number, position: { x: number; y: number }) => void;
	/** Clicking an image's own glyph opens the lightbox (§4.6 step 9). */
	onLightbox?: (item: FileObject) => void;
};

type ViewProps = {
	items: FileObject[];
	selection: Selection;
	handlers: ItemHandlers;
	/** Which entries may be ticked; an archive listing disables all of them. */
	checkbox: boolean;
	/** §4.6: `dblclick` makes a single click inert. */
	openOnCheckbox: "direct" | "dblclick" | "disable_while_checked";
	/** The mobile breakpoint disables the checked-mode branches entirely. */
	isMobile: boolean;
};

/**
 * The one click decision, shared by every layout.
 *
 * `index` is the position in the rendered list and is what a Shift range needs; it is
 * passed in rather than looked up so a filtered view (the image layout) still
 * reports positions in its own list, which is what §18.35 corrects the original to
 * do.
 */
export function useItemClick({
	selection,
	handlers,
	openOnCheckbox,
	isMobile,
	checkbox,
}: {
	selection: Selection;
	handlers: ItemHandlers;
	openOnCheckbox: "direct" | "dblclick" | "disable_while_checked";
	isMobile: boolean;
	checkbox: boolean;
}) {
	const doubleClickOpens = checkbox && !isMobile && openOnCheckbox === "dblclick";
	const disabledWhileChecked = checkbox && !isMobile && openOnCheckbox === "disable_while_checked";

	return useCallback(
		(event: React.MouseEvent, item: FileObject, index: number) => {
			// Step 3 comes before the mode checks: a modified click belongs to the
			// browser, and cancelling it would break "open in a new tab".
			if (event.ctrlKey || event.metaKey || event.shiftKey) return;
			if (disabledWhileChecked && selection.count > 0) {
				event.preventDefault();
				selection.toggle(item.path, index);
				return;
			}
			// Step 2: in double-click mode a single click is inert, including the
			// default navigation the wrapper would otherwise perform.
			if (doubleClickOpens) {
				event.preventDefault();
				return;
			}
			handlers.onOpen(item);
		},
		[doubleClickOpens, disabledWhileChecked, handlers, selection],
	);
}

/* --------------------------------------------------------------- list (§4.1) */

const OVERFLOW: Record<FilenameOverflow, string> = {
	ellipsis: "truncate",
	scrollable: "overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
	multi_line: "break-all whitespace-normal",
};

type ListProps = ViewProps & {
	onSort: (field: SortState["field"]) => void;
	showCount: boolean;
	overflow: FilenameOverflow;
};

export function FileList({
	items,
	selection,
	handlers,
	checkbox,
	openOnCheckbox,
	isMobile,
	onSort,
	showCount,
	overflow,
}: ListProps) {
	const t = useT();
	const click = useItemClick({ selection, handlers, openOnCheckbox, isMobile, checkbox });
	const folders = items.filter((item) => item.is_dir).length;

	return (
		<div className="flex w-full flex-col">
			{/* §4.1: the header row. The first cell holds the select-all box and the
			    sortable "Name"; its label becomes the selection summary when
			    anything is ticked, and the sort stays bound to that text.

			    The padding and the column widths are the row's own, so the header
			    and every row below it share one grid; giving the header `px-2` while
			    a row used `px-3` put the two on edges three pixels apart. */}
			<div className="flex w-full items-center gap-3 border-b border-border bg-neutral-2/60 px-3 py-2 text-[11.5px] font-semibold tracking-wide text-neutral-11 uppercase">
				<div className="flex min-w-0 flex-1 items-center gap-2.5">
					{checkbox && (
						<Checkbox
							checked={selection.allSelected}
							indeterminate={selection.someSelected}
							onChange={selection.toggleAll}
							aria-label={selection.allSelected ? "Deselect all" : "Select all"}
						/>
					)}
					<button
						type="button"
						onClick={() => onSort("name")}
						className="tint flex min-w-0 items-center rounded text-left uppercase hover:text-foreground"
					>
						<span className="truncate">{selection.count > 0 ? summary(t, selection) : t("home.obj.name")}</span>
					</button>
				</div>
				<button
					type="button"
					onClick={() => onSort("size")}
					className="tint hidden w-[92px] shrink-0 rounded text-right uppercase hover:text-foreground md:block"
				>
					{t("home.obj.size")}
				</button>
				<button
					type="button"
					onClick={() => onSort("modified")}
					className="tint hidden w-[148px] shrink-0 rounded text-right uppercase hover:text-foreground md:block"
				>
					{t("home.obj.modified")}
				</button>
			</div>

			{items.map((item, index) => (
				<FileRow
					key={item.path}
					item={item}
					index={index}
					selected={selection.isSelected(item.path)}
					checkbox={checkbox}
					overflow={overflow}
					onClick={click}
					onSelect={(extend) => selection.toggle(item.path, index, extend)}
					handlers={handlers}
				/>
			))}

			{/* §4.1 and §18.32: the count sits *under* a list and *above* a grid. */}
			{showCount && items.length > 0 && (
				<p className="px-2 pt-1 text-xs text-neutral-11">
					{folders === items.length
						? t("home.obj.count_folders", { folders })
						: folders === 0
							? t("home.obj.count_files", { files: items.length })
							: t("home.obj.count", { folders, files: items.length - folders })}
				</p>
			)}
		</div>
	);
}

/** The selection summary that replaces "Name" in the header (§4.1). */
function summary(t: ReturnType<typeof useT>, selection: Selection) {
	if (selection.folders && selection.files)
		return t("home.obj.selected", { folders: selection.folders, files: selection.files });
	if (selection.folders) return t("home.obj.selected_folders", { folders: selection.folders });
	return t("home.obj.selected_files", { files: selection.files });
}

type RowProps = {
	item: FileObject;
	index: number;
	selected: boolean;
	checkbox: boolean;
	overflow: FilenameOverflow;
	onClick: (event: React.MouseEvent, item: FileObject, index: number) => void;
	onSelect: (extend: boolean) => void;
	handlers: ItemHandlers;
};

/**
 * One row.
 *
 * §4.2 and §18.3: the selected background is the *same* tint as the hover, and only
 * the checkbox distinguishes them. That is recorded as deliberate, so it stays.
 *
 * The mount point's size cell is the only place the size column is not a number: a
 * mount has no size of its own, so it shows the disk usage when the driver reports
 * it and `-` when it does not.
 */
const FileRow = memo(function FileRow({
	item,
	index,
	selected,
	checkbox,
	overflow,
	onClick,
	onSelect,
	handlers,
}: RowProps) {
	const t = useT();
	const locked = isLocked(item);
	const mount = isMountPoint(item);
	const picture = isPicture(item.name);
	const total = typeof item.total_space === "number" ? item.total_space : 0;
	const used = typeof item.used_space === "number" ? item.used_space : 0;

	return (
		<div
			role="link"
			tabIndex={0}
			aria-current={selected ? "true" : undefined}
			data-index={index}
			data-path={item.path}
			onClick={(event) => onClick(event, item, index)}
			onDoubleClick={(event) => {
				event.preventDefault();
				handlers.onOpen(item);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") handlers.onOpen(item);
			}}
			onContextMenu={(event) => {
				event.preventDefault();
				handlers.onContextMenu(item, index, { x: event.clientX, y: event.clientY });
			}}
			style={{ ["--item-index" as string]: index }}
			className={`tint item-in group flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-row-hover ${
				selected ? "bg-row-hover" : ""
			} ${locked ? "opacity-80" : ""}`}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2.5">
				{checkbox && (
					<span
						// The box must not also navigate: §4.2 step 1.
						onClick={(event) => {
							event.stopPropagation();
							onSelect(event.shiftKey);
						}}
					>
						<Checkbox checked={selected} onChange={() => onSelect(false)} aria-label={item.name} />
					</span>
				)}
				{item.is_dir ? (
					<Icon name={kindIcon(item.name, true)} className="size-[1.15rem] shrink-0 text-main" strokeWidth={1.5} />
				) : picture && handlers.onLightbox ? (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							handlers.onLightbox?.(item);
						}}
						aria-label={item.name}
						className="tap shrink-0 cursor-pointer"
					>
						<Icon name="file-image" className="size-[1.15rem] text-main" strokeWidth={1.5} />
					</button>
				) : (
					<Icon name={kindIcon(item.name)} className="size-[1.15rem] shrink-0 text-main" strokeWidth={1.5} />
				)}
				<span title={item.name} className={`min-w-0 flex-1 text-[13.5px] leading-tight ${OVERFLOW[overflow]}`}>
					{item.name}
				</span>
				{mount && (
					<span className="shrink-0 rounded bg-info-3 px-1.5 py-0.5 text-[10.5px] leading-none font-medium text-info-11">
						{t("common.mount")}
					</span>
				)}
			</div>

			<div className="hidden w-[92px] shrink-0 justify-end text-[13px] md:flex">
				{item.is_dir ? (
					total > 0 ? (
						<span className="numeric text-right text-[12px] text-neutral-11">
							{formatSize(used)} / {formatSize(total)}
						</span>
					) : (
						<span className="text-neutral-9">—</span>
					)
				) : (
					<span className="numeric text-neutral-11">{formatSize(item.size)}</span>
				)}
			</div>
			<div className="hidden w-[148px] shrink-0 text-right text-[13px] text-neutral-11 md:block">
				<span className="numeric">{formatDate(item.modified)}</span>
			</div>
		</div>
	);
});

/* --------------------------------------------------------------- grid (§4.3) */

export function FileGrid({
	items,
	selection,
	handlers,
	checkbox,
	openOnCheckbox,
	isMobile,
	itemSize,
	showCount,
}: ViewProps & { itemSize: number; showCount: boolean }) {
	const t = useT();
	const click = useItemClick({ selection, handlers, openOnCheckbox, isMobile, checkbox });
	const folders = items.filter((item) => item.is_dir).length;

	return (
		<div className="flex w-full flex-col gap-2">
			{showCount && items.length > 0 && (
				<p className="px-2 text-xs text-neutral-11">{countSummary(t, selection, folders, items.length)}</p>
			)}
			<div
				className="grid w-full gap-1"
				// §4.3: `minmax(size + 20, 1fr)`, so a tile keeps a gutter at the
				// smallest size the setting allows.
				style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${itemSize + 20}px, 1fr))` }}
			>
				{items.map((item, index) => (
					<div
						key={item.path}
						role="link"
						tabIndex={0}
						data-index={index}
						onClick={(event) => click(event, item, index)}
						onDoubleClick={(event) => {
							event.preventDefault();
							handlers.onOpen(item);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") handlers.onOpen(item);
						}}
						onContextMenu={(event) => {
							event.preventDefault();
							handlers.onContextMenu(item, index, { x: event.clientX, y: event.clientY });
						}}
						style={{ ["--item-index" as string]: index }}
						className={`tint item-in group flex cursor-pointer flex-col gap-1 rounded-lg p-1 hover:scale-[1.06] hover:bg-row-hover ${
							selection.isSelected(item.path) ? "bg-row-hover" : ""
						}`}
					>
						<div
							className="relative flex w-full items-center justify-center overflow-hidden"
							style={{ height: itemSize }}
						>
							{checkbox && (
								<span
									className="absolute top-1 left-1 z-10"
									onClick={(event) => {
										event.stopPropagation();
										selection.toggle(item.path, index, event.shiftKey);
									}}
								>
									<Checkbox
										checked={selection.isSelected(item.path)}
										onChange={() => undefined}
										aria-label={item.name}
									/>
								</span>
							)}
							{item.is_dir ? (
								<Icon
									name="folder"
									style={{ width: itemSize - 30, height: itemSize - 30 }}
									className="text-main"
									strokeWidth={1.1}
								/>
							) : isPicture(item.name) ? (
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										// §4.6: an image's thumbnail opens the lightbox.
										handlers.onLightbox?.(item);
									}}
									className="flex h-full w-full items-center justify-center"
								>
									<Thumbnail path={item.path} name={item.name} iconClassName="size-8" alt={item.name} />
								</button>
							) : (
								<Thumbnail path={item.path} name={item.name} iconClassName="size-8" />
							)}
						</div>
						<p title={item.name} className="w-full truncate text-center text-[13px] text-neutral-11">
							{item.name}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

/* -------------------------------------------------------------- image (§4.5) */

export function FileImages({
	items,
	selection,
	handlers,
	checkbox,
	openOnCheckbox,
	isMobile,
	folderPosition,
	itemSize,
	showCount,
}: ViewProps & { folderPosition: "top" | "bottom" | "none"; itemSize: number; showCount: boolean }) {
	const t = useT();
	const click = useItemClick({ selection, handlers, openOnCheckbox, isMobile, checkbox });
	// §18.35 records that the reference build indexes the folder grid against the
	// *filtered* list, so ticking a folder there hits the wrong entry. The note says
	// to use the main list's index if the goal is a usable product; that is what
	// these two maps are for.
	const positions = new Map(items.map((item, index) => [item.path, index]));
	const folders = items.filter((item) => item.is_dir);
	const pictures = items.filter((item) => !item.is_dir && isPicture(item.name));

	const folderGrid =
		folders.length > 0 && folderPosition !== "none" ? (
			<div className="grid w-full gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}>
				{folders.map((item) => {
					const index = positions.get(item.path) ?? 0;
					return (
						<div
							key={item.path}
							role="link"
							tabIndex={0}
							onClick={(event) => click(event, item, index)}
							onDoubleClick={(event) => {
								event.preventDefault();
								handlers.onOpen(item);
							}}
							onContextMenu={(event) => {
								event.preventDefault();
								handlers.onContextMenu(item, index, { x: event.clientX, y: event.clientY });
							}}
							className={`tint flex cursor-pointer flex-col gap-1 rounded-lg p-1 hover:scale-[1.06] hover:bg-row-hover ${
								selection.isSelected(item.path) ? "bg-row-hover" : ""
							}`}
						>
							<div className="relative flex w-full items-center justify-center" style={{ height: itemSize }}>
								{checkbox && (
									<span
										className="absolute top-1 left-1 z-10"
										onClick={(event) => {
											event.stopPropagation();
											selection.toggle(item.path, index, event.shiftKey);
										}}
									>
										<Checkbox
											checked={selection.isSelected(item.path)}
											onChange={() => undefined}
											aria-label={item.name}
										/>
									</span>
								)}
								<Icon
									name="folder"
									className="text-main"
									style={{ width: itemSize - 30, height: itemSize - 30 }}
									strokeWidth={1.1}
								/>
							</div>
							<p title={item.name} className="w-full truncate text-center text-[13px] text-neutral-11">
								{item.name}
							</p>
						</div>
					);
				})}
			</div>
		) : null;

	return (
		<div className="flex w-full flex-col gap-2">
			{showCount && (
				<p className="px-2 text-xs text-neutral-11">
					{countSummary(t, selection, folders.length, folders.length + pictures.length)}
				</p>
			)}
			{folderPosition === "top" && folderGrid}
			{pictures.length === 0 ? (
				// §4.5: the only empty state the spec spells out for a listing.
				<p className="p-8 text-center text-sm text-neutral-10">{t("home.no_images")}</p>
			) : (
				<div className="flex flex-wrap gap-1">
					{pictures.map((item) => {
						const index = positions.get(item.path) ?? 0;
						return (
							<div
								key={item.path}
								role="link"
								tabIndex={0}
								onClick={(event) => {
									// §4.5: a picture opens the lightbox, not the file page.
									if (event.ctrlKey || event.metaKey || event.shiftKey) return;
									handlers.onLightbox?.(item);
								}}
								onDoubleClick={(event) => {
									event.preventDefault();
									selection.selectOnly(item.path, index);
									handlers.onLightbox?.(item);
								}}
								onContextMenu={(event) => {
									event.preventDefault();
									handlers.onContextMenu(item, index, { x: event.clientX, y: event.clientY });
								}}
								className="relative flex cursor-pointer flex-col gap-1 rounded-lg border-2 border-transparent p-1 hover:border-main"
								style={{ flex: "1 1 180px", maxWidth: "100%" }}
							>
								{checkbox && (
									<span
										className="absolute top-2 left-2 z-10"
										onClick={(event) => {
											event.stopPropagation();
											selection.toggle(item.path, index, event.shiftKey);
										}}
									>
										<Checkbox
											checked={selection.isSelected(item.path)}
											onChange={() => undefined}
											aria-label={item.name}
										/>
									</span>
								)}
								{/* §18.30: the image layout shows no file names, only pictures. */}
								<Thumbnail
									path={item.path}
									name={item.name}
									className="h-[150px] w-full"
									iconClassName="size-12"
									alt={item.name}
								/>
							</div>
						);
					})}
				</div>
			)}
			{folderPosition === "bottom" && folderGrid}
		</div>
	);
}

/** The count line a grid or image view shows above itself (§4.3). */
function countSummary(t: ReturnType<typeof useT>, selection: Selection, folders: number, total: number) {
	if (selection.count > 0) {
		if (selection.folders && selection.files)
			return t("home.obj.selected", { folders: selection.folders, files: selection.files });
		if (selection.folders) return t("home.obj.selected_folders", { folders: selection.folders });
		return t("home.obj.selected_files", { files: selection.files });
	}
	const files = total - folders;
	if (folders && files) return t("home.obj.count", { folders, files });
	if (folders) return t("home.obj.count_folders", { folders });
	return t("home.obj.count_files", { files });
}

/** Re-exported for the toolbar's "sort" affordance. */
export { IconButton, kindOf };
export type { Permissions };

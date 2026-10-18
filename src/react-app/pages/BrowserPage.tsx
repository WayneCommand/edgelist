import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
	fileLink,
	listFiles,
	makeDirectory,
	movePaths,
	removeEmptyDirectories,
	removePaths,
	rename as renamePath,
	writeFile,
} from "../lib/api";
import type { FileObject } from "../lib/types";
import { crumbsOf, joinPath, normalizePath, parentOf } from "../lib/paths";
import { notify } from "../lib/feedback";
import { permissionsFor, unwritableReason } from "../lib/permissions";
import { getPreference, setLayoutFor, setSortFor, readFlag, writeFlag, type LayoutMode } from "../lib/preferences";
import { nextSort, pageNumbers, sortItems } from "../lib/sort";
import { useLayoutFor, useSortFor, useT, useWorkspace } from "../hooks/useStore";
import { useSelection } from "../hooks/useSelection";
import { ROUTES } from "../routes";
import { ActionButton } from "../ui/ActionButton";
import { Loading, StateMessage } from "../ui/Field";
import { Icon, MOD_KEY } from "../ui/Icon";
import { MenuEntries } from "../ui/Chrome";
import { Dropdown, DropdownPopover, DropdownTrigger } from "@heroui/react/dropdown";
import { ContextMenu, type MenuEntry } from "../components/ContextMenu";
import { DirectoryTree } from "../components/DirectoryTree";
import { FileGrid, FileImages, FileList, type ItemHandlers } from "../components/FileViews";
import { LocalSettingsDrawer } from "../components/LocalSettingsDrawer";
import { DeleteDialog, RemoveEmptyDialog, TransferDialog } from "../components/TransferDialog";
import { NameDialog } from "../components/NameDialog";
import { BatchRenameDialog } from "../components/BatchRenameDialog";
import { SearchDialog } from "../components/SearchDialog";
import { UploadDialog } from "../components/UploadDialog";
import { DirectoryReadme } from "../components/DirectoryReadme";

/**
 * The file browser (§3).
 *
 * This is the page the spec spends most of its length on, and the shape it describes is
 * a column: header, breadcrumbs, one object card, a footer, and a set of floating
 * layers. That order is the DOM order here, which is what makes the four sticky
 * positions work without a portal.
 *
 * Four decisions about *how* it is built, since the spec only fixes what it looks like:
 *
 * **The listing is fetched whole and paged in memory.** A column-click re-sort has to
 * be instant (§4.1), and the Worker's paging would make it a round trip. It also means
 * the count line and the page bar agree with the list, which they cannot when the
 * server pages.
 *
 * **The selection is a hook, not page state.** §4.6's Shift algorithm needs an anchor
 * and an end, and `useSelection` owns both so the three layouts share one answer.
 *
 * **The floating cluster is one component with a visibility rule per entry.** §6.1's
 * table is a list of `(condition, action)` pairs; writing it as twelve conditional
 * blocks is how one of them ends up wrong.
 *
 * **The dialogs are mounted, not routed.** §7 says they are raised by name from anywhere
 * via an event bus; a small `Dialog` union of ours is the same idea with types, and it
 * means a dialog survives a re-render of the list underneath it.
 */

type ActiveDialog =
	| { kind: "none" }
	| { kind: "mkdir" }
	| { kind: "new-file" }
	| { kind: "rename"; item: FileObject }
	| { kind: "copy" }
	| { kind: "move" }
	| { kind: "delete" }
	| { kind: "remove-empty" }
	| { kind: "upload" }
	| { kind: "search" }
	| { kind: "transfer"; mode: "copy" | "move" } // alias kept off the union's face
	| { kind: "batch-rename" }
	| { kind: "recursive-move" };

export function BrowserPage() {
	const t = useT();
	const navigate = useNavigate();
	const { mounts } = useWorkspace();

	const [path, setPath] = useState<string>(() => readPathFromLocation());
	const [items, setItems] = useState<FileObject[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [readme, setReadme] = useState("");
	const [header, setHeader] = useState("");
	const [dialog, setDialog] = useState<ActiveDialog>({ kind: "none" });
	const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [clusterOpen, setClusterOpen] = useState(false);
	const [page, setPage] = useState(1);
	const [showTop, setShowTop] = useState(false);
	const [checkboxMode, setCheckboxMode] = useState(() => readCheckboxMode());
	const [sidebarHover, setSidebarHover] = useState(false);

	const layout = useLayoutFor(path);
	const sort = useSortFor(path);
	const selection = useSelection(items);

	/* ------------------------------------------------------------------ loading */

	/**
	 * Reads a directory.
	 *
	 * `refresh` asks the Worker to read past its directory cache. It matters after a
	 * write: the cache invalidation the Worker performs only reaches the datacentre that
	 * handled the write, so a client that has just changed the directory has to ask for a
	 * fresh listing rather than trust its local drop.
	 */
	const load = useCallback(
		async (target: string, options: { refresh?: boolean; keepSelection?: boolean } = {}) => {
			setLoading(true);
			setError("");
			if (!options.keepSelection) selection.clear();
			try {
				const data = await listFiles(target, { per_page: 0, refresh: options.refresh });
				setItems(data.content ?? []);
				setReadme(data.readme ?? "");
				setHeader(data.header ?? "");
				setPath(target);
			} catch (reason) {
				setError(reason instanceof Error ? reason.message : t("home.load_failed"));
				setItems([]);
				setReadme("");
				setHeader("");
				setPath(target);
			} finally {
				setLoading(false);
			}
		},
		// `selection.clear` is stable; the translator would make this re-run on a
		// language change, and a language change must not refetch a directory.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	useEffect(() => {
		void load(path);
		// Only on mount: `path` is set by `load` itself, and depending on it would
		// loop.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/** Navigates, and records it in the URL so Back and a refresh both work. */
	const go = useCallback(
		(target: string) => {
			const next = normalizePath(target);
			navigate(ROUTES.files(next));
			setPath(next);
			setPage(1);
			void load(next);
		},
		[load, navigate],
	);

	// The top bar's height is not measured; §3.3's three sticky modes are.
	const scrollTop = useScrollPosition();
	useEffect(() => setShowTop(scrollTop > 100), [scrollTop]);

	/* --------------------------------------------------------------- derived state */

	// Sorted once per listing or sort change, and the selection is applied to the
	// sorted array so a Shift range follows what is on screen.
	const sorted = useMemo(() => sortItems(items, sort), [items, sort]);
	// 120 a page is the spec's dense default; "all" is a size of 0 and one page.
	const PER_PAGE = 120;
	const pages = sorted.length > PER_PAGE ? pageNumbers(page, Math.ceil(sorted.length / PER_PAGE)) : [];
	const visible = useMemo(() => sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE), [sorted, page]);

	const permissions = useMemo(() => permissionsFor(selection.items), [selection.items]);
	const single = selection.count === 1 ? selection.items[0] : null;
	const canCreate = !unwritableReason(path, mounts);

	/* -------------------------------------------------------------- item handlers */

	const handlers: ItemHandlers = useMemo(
		() => ({
			onOpen: (item) => {
				if (item.is_dir) {
					go(item.path);
					return;
				}
				// A file opens its own page; `kindOf` decides which previewer, there.
				navigate(ROUTES.files(item.path));
			},
			onContextMenu: (item, index, position) => {
				// §4.6: right-clicking inside a multi-selection keeps the selection;
				// anywhere else selects the row first, so the menu describes what was
				// pointed at.
				if (selection.count <= 1 || !selection.isSelected(item.path)) {
					selection.selectOnly(item.path, index);
				}
				setMenu({ ...position, items: contextEntries(item) });
			},
			onLightbox: (item) => navigate(`${ROUTES.files(item.path)}?preview=image`),
		}),
		// The handlers close over the selection and the actions below; both change
		// identity when what they read changes, which is the intent.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[selection, go, navigate],
	);

	/** §6.4's menu, in the spec's own order. */
	function contextEntries(item: FileObject): MenuEntry[] {
		const entries: MenuEntry[] = [];
		const chosen = selection.count === 1 ? [item] : selection.items;
		const allows = permissionsFor(chosen);

		if (chosen.length === 1 && !item.is_dir) {
			entries.push(
				{
					label: t("toolbar.open_with"),
					icon: "external-link",
					onSelect: () => navigate(ROUTES.files(item.path)),
				},
				{
					label: t("preview.download"),
					icon: "download",
					separatorBefore: true,
					onSelect: () => void download([item]),
				},
			);
		}
		if (allows.rename.allowed && canCreate) {
			entries.push({
				label: t("toolbar.rename"),
				icon: "pencil",
				separatorBefore: true,
				onSelect: () => setDialog({ kind: "rename", item }),
			});
		}
		if (allows.move.allowed && canCreate)
			entries.push({ label: t("toolbar.move"), icon: "folder-arrow", onSelect: () => setDialog({ kind: "move" }) });
		if (allows.copy.allowed && canCreate)
			entries.push({ label: t("toolbar.copy"), icon: "copy", onSelect: () => setDialog({ kind: "copy" }) });
		if (allows.remove.allowed && canCreate) {
			entries.push({
				label: t("toolbar.delete"),
				icon: "trash",
				danger: true,
				onSelect: () => setDialog({ kind: "delete" }),
			});
		}
		if (chosen.length === 1) {
			entries.push({
				label: t("toolbar.copy_link"),
				icon: "link",
				separatorBefore: true,
				onSelect: () => void copyLink(item),
			});
		}
		return entries;
	}

	/* -------------------------------------------------------------------- actions */

	async function download(targets: FileObject[]) {
		// Sequential on purpose: browsers throttle parallel blob downloads, and a
		// failure on one entry should not abort the rest.
		for (const item of targets) {
			if (item.is_dir) continue;
			try {
				const { readFile } = await import("../lib/api");
				const blob = await (await readFile(item.path)).blob();
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = item.name;
				link.click();
				setTimeout(() => URL.revokeObjectURL(url), 4000);
			} catch (reason) {
				notify.error(reason);
			}
		}
	}

	async function copyLink(item: FileObject) {
		try {
			const data = await fileLink(item.path);
			// The Worker answers with a path-relative `/d...`, which is only useful
			// once it is absolute.
			await navigator.clipboard.writeText(new URL(data.url, globalThis.location.origin).href);
			notify.success(t("global.copied"));
		} catch (reason) {
			notify.error(reason);
		}
	}

	async function afterWrite() {
		await load(path, { refresh: true });
	}

	/* --------------------------------------------------------------------- render */

	const crumbs = crumbsOf(path);
	const sticky = readNavbarPosition();
	const showSidebar = readShowSidebar();

	return (
		<div className="mx-auto flex w-full max-w-[980px] flex-1 flex-col gap-4 px-2 pt-1 [min-height:80vh]">
			{/* ---------------------------------------------------------- header (§3.3) */}
			<header
				className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between bg-background px-2 py-2 ${
					sticky === "sticky" ? "sticky top-0 z-sticky" : ""
				}`}
			>
				<button type="button" onClick={() => go("/")} className="tap flex items-center gap-2.5">
					<LogoLockup />
				</button>
				{!loading && !error && (
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={() => setDialog({ kind: "search" })}
							className="tap flex h-8 w-32 items-center gap-1.5 rounded-md border-2 border-transparent bg-main-soft px-1 text-main hover:bg-main-soft-hover"
							aria-label={t("search.search")}
						>
							<Icon name="search" className="size-4" />
							<span className="ml-auto flex items-center gap-1">
								<kbd className="rounded bg-white/40 px-1 text-[10px] font-medium dark:bg-black/20">{MOD_KEY}</kbd>
								<kbd className="rounded bg-white/40 px-1 text-[10px] font-medium dark:bg-black/20">K</kbd>
							</span>
						</button>
						<Dropdown>
							<DropdownTrigger
								className="tap flex size-8 items-center justify-center rounded-md bg-main-soft p-0 text-main hover:bg-main-soft-hover"
								aria-label={t("toolbar.toggle_checkbox")}
							>
								<Icon name={layout === "list" ? "list" : layout === "grid" ? "grid" : "image"} className="size-4" />
							</DropdownTrigger>
							<DropdownPopover placement="bottom end">
								<MenuEntries
									entries={[
										{ id: "list", label: t("home.layouts.list"), icon: "list" },
										{ id: "grid", label: t("home.layouts.grid"), icon: "grid" },
										{ id: "image", label: t("home.layouts.image"), icon: "image" },
									]}
									onAction={(id) => {
										setLayoutFor(path, id as LayoutMode);
										setPage(1);
									}}
								/>
							</DropdownPopover>
						</Dropdown>
					</div>
				)}
			</header>

			{/* ------------------------------------------------------- breadcrumbs (§3.4) */}
			<nav
				aria-label="Breadcrumb"
				className={`-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-y-0 bg-background px-2 ${
					sticky === "sticky"
						? "sticky top-[60px] z-sticky"
						: sticky === "only_navbar_sticky"
							? "sticky top-0 z-sticky"
							: ""
				}`}
			>
				{crumbs.map((crumb, index) => {
					const last = index === crumbs.length - 1;
					return (
						<span key={crumb.path} className="flex items-center">
							{index > 0 && <span className="px-0.5 text-neutral-9">/</span>}
							{last ? (
								<span className="max-w-64 truncate px-1 py-1 font-medium break-all text-neutral-12" aria-current="page">
									{crumb.name || t("home.home")}
								</span>
							) : (
								<button
									type="button"
									onClick={() => go(crumb.path)}
									className="tap max-w-56 truncate rounded-lg px-1 py-1 break-all hover:bg-row-hover"
								>
									{crumb.name || t("home.home")}
								</button>
							)}
						</span>
					);
				})}
			</nav>

			{/* -------------------------------------------------------- object card (§3.5) */}
			<section className="flex w-full flex-col gap-2 rounded-2xl bg-surface p-2 shadow-lg">
				{error ? (
					<StateMessage
						icon="alert-triangle"
						tone="danger"
						title={error}
						className="py-8"
						action={
							<div className="flex gap-2">
								<ActionButton tone="soft" onPress={() => go(parentOf(path))}>
									{t("global.back")}
								</ActionButton>
								<ActionButton tone="soft" onPress={() => void load(path, { refresh: true })}>
									{t("global.retry")}
								</ActionButton>
							</div>
						}
					/>
				) : loading ? (
					<div className="flex items-center justify-center py-8">
						<Loading size="lg" />
					</div>
				) : (
					<>
						<DirectoryReadme slot="header" path={path} items={items} inline={header} onNavigate={go} />
						{layout === "list" ? (
							<FileList
								items={visible}
								selection={selection}
								handlers={handlers}
								checkbox={checkboxMode}
								openOnCheckbox={readOpenOnCheckbox()}
								isMobile={false}
								onSort={(field) => setSortFor(path, nextSort(sort, field))}
								showCount={readShowCount()}
								overflow={readOverflow()}
							/>
						) : layout === "grid" ? (
							<FileGrid
								items={visible}
								selection={selection}
								handlers={handlers}
								checkbox={checkboxMode}
								openOnCheckbox={readOpenOnCheckbox()}
								isMobile={false}
								itemSize={readGridSize()}
								showCount={readShowCount()}
							/>
						) : (
							<FileImages
								items={visible}
								selection={selection}
								handlers={handlers}
								checkbox={checkboxMode}
								openOnCheckbox={readOpenOnCheckbox()}
								isMobile={false}
								folderPosition={readFolderInImageView()}
								itemSize={readGridSize()}
								showCount={readShowCount()}
							/>
						)}
						{pages.length > 0 && (
							<div className="flex flex-wrap items-center justify-center gap-1 py-1">
								{pages.map((entry, index) =>
									entry === "gap" ? (
										<span key={`gap-${index}`} className="px-1 text-xs text-neutral-9">
											…
										</span>
									) : (
										<button
											key={entry}
											type="button"
											onClick={() => setPage(entry)}
											aria-current={entry === page ? "page" : undefined}
											className={`tap numeric min-w-8 rounded-md px-2 py-1 text-[13px] ${
												entry === page ? "bg-info-3 font-medium text-info-11" : "text-neutral-11 hover:bg-row-hover"
											}`}
										>
											{entry}
										</button>
									),
								)}
							</div>
						)}
						<DirectoryReadme slot="readme" path={path} items={items} inline={readme} onNavigate={go} />
					</>
				)}
			</section>

			{/* --------------------------------------------------------------- footer (§3.7) */}
			<footer className="flex items-center justify-center gap-2 py-4 text-xs text-neutral-11">
				<a href="https://doc.oplist.org" target="_blank" rel="noreferrer" className="hover:underline">
					{t("home.footer.powered_by")}
				</a>
				<span aria-hidden="true">|</span>
				<button type="button" onClick={() => navigate(ROUTES.profile)} className="tap hover:underline">
					{t("home.footer.manage")}
				</button>
			</footer>

			{/* ------------------------------------------------------- floating layers (§6) */}
			<SelectionBar
				selection={selection}
				permissions={permissions}
				writable={canCreate}
				onRename={() => single && setDialog({ kind: "rename", item: single })}
				onCopy={() => setDialog({ kind: "copy" })}
				onMove={() => setDialog({ kind: "move" })}
				onDelete={() => setDialog({ kind: "delete" })}
				onDownload={() => void download(selection.items)}
			/>

			<div className="fixed right-4 bottom-4 z-modal flex flex-col items-end gap-2">
				{clusterOpen && (
					<div className="arrive flex flex-col gap-1 rounded-lg bg-neutral-1 p-1 shadow-lg [--arrive-scale:0.9]">
						<ClusterButton
							icon="refresh"
							label={t("toolbar.refresh")}
							show={!loading && canCreate}
							onPress={() => void load(path, { refresh: true, keepSelection: true })}
						/>
						<ClusterButton
							icon="file-text"
							label={t("toolbar.new_file")}
							show={canCreate}
							onPress={() => setDialog({ kind: "new-file" })}
						/>
						<ClusterButton
							icon="folder-plus"
							label={t("toolbar.mkdir")}
							show={canCreate}
							onPress={() => setDialog({ kind: "mkdir" })}
						/>
						<ClusterButton
							icon="folder-arrow"
							label={t("toolbar.recursive_move")}
							show={canCreate}
							onPress={() => setDialog({ kind: "recursive-move" })}
						/>
						<ClusterButton
							icon="trash"
							label={t("toolbar.remove_empty_directory")}
							show={canCreate}
							onPress={() => setDialog({ kind: "remove-empty" })}
						/>
						<ClusterButton
							icon="sort"
							label={t("toolbar.batch_rename")}
							show={canCreate}
							onPress={() => setDialog({ kind: "batch-rename" })}
						/>
						<ClusterButton
							icon="upload"
							label={t("toolbar.upload")}
							show={canCreate}
							onPress={() => setDialog({ kind: "upload" })}
						/>
						<ClusterButton
							icon="check-circle"
							label={t("toolbar.toggle_checkbox")}
							show
							active={checkboxMode}
							onPress={() => {
								const next = !checkboxMode;
								setCheckboxMode(next);
								writeCheckboxMode(next);
								if (!next) selection.clear();
							}}
						/>
						<ClusterButton
							icon="settings"
							label={t("toolbar.local_settings")}
							show
							onPress={() => setSettingsOpen(true)}
						/>
						<ClusterButton icon="more-vertical" label={t("toolbar.more")} show onPress={() => setClusterOpen(false)} />
					</div>
				)}
				<button
					type="button"
					onClick={() => setClusterOpen((value) => !value)}
					aria-label={t("toolbar.more")}
					aria-expanded={clusterOpen}
					className="tap flex size-10 items-center justify-center rounded-full bg-surface text-main shadow-lg"
				>
					<Icon name={clusterOpen ? "close" : "more-horizontal"} className="size-5" />
				</button>
			</div>

			{/* §6.3: the back-to-top tab, only past 100px. */}
			{showTop && (
				<button
					type="button"
					onClick={() => globalThis.scrollTo({ top: 0, behavior: "smooth" })}
					aria-label="Back to top"
					className="fixed top-0 right-5 z-overlay hidden rounded-b-full bg-white/90 p-2 text-main shadow-lg hover:bg-main hover:text-white md:block dark:bg-main dark:text-white"
				>
					<Icon name="chevron-up" className="size-5" />
				</button>
			)}

			{/* §3.9: the sidebar is a local preference and starts off. */}
			{showSidebar && (
				<aside
					onMouseEnter={() => setSidebarHover(true)}
					onMouseLeave={() => setSidebarHover(false)}
					style={{ transform: sidebarHover ? "translateX(0)" : "translateX(calc(-100% + 3px))" }}
					className="fixed top-[3px] left-[3px] z-overlay hidden h-[calc(100vh-6px)] min-w-[180px] overflow-y-auto rounded-lg bg-surface p-2 shadow-lg transition-transform duration-200 md:block"
				>
					<DirectoryTree value={path} onSelect={go} className="border-0" />
				</aside>
			)}

			{/* ------------------------------------------------------------- dialogs */}
			{dialog.kind === "mkdir" && (
				<NameDialog
					title={t("toolbar.input_dir_name")}
					placeholder={t("toolbar.input_dir_name")}
					onClose={() => setDialog({ kind: "none" })}
					onSubmit={async (name) => {
						try {
							await makeDirectory(joinPath(path, name));
							notify.success(t("global.update_success"));
							setDialog({ kind: "none" });
							await afterWrite();
						} catch (reason) {
							notify.error(reason);
						}
					}}
				/>
			)}
			{dialog.kind === "new-file" && (
				<NameDialog
					title={t("toolbar.input_filename")}
					placeholder={t("toolbar.input_filename")}
					onClose={() => setDialog({ kind: "none" })}
					onSubmit={async (name) => {
						try {
							await writeFile(joinPath(path, name), new Blob([""]), "application/octet-stream");
							notify.success(t("global.update_success"));
							setDialog({ kind: "none" });
							await afterWrite();
						} catch (reason) {
							notify.error(reason);
						}
					}}
				/>
			)}
			{dialog.kind === "rename" && (
				<NameDialog
					title={t("toolbar.input_new_name")}
					initialValue={dialog.item.name}
					// §7.1: a file keeps its extension selected out.
					stemOnly={!dialog.item.is_dir}
					onClose={() => setDialog({ kind: "none" })}
					onSubmit={async (name) => {
						try {
							await renamePath(dialog.item.path, name);
							notify.success(t("global.update_success"));
							setDialog({ kind: "none" });
							await afterWrite();
						} catch (reason) {
							notify.error(reason);
						}
					}}
				/>
			)}
			{dialog.kind === "copy" && (
				<TransferDialog
					mode="copy"
					srcDir={path}
					names={selection.items.map((item) => item.name)}
					onClose={() => setDialog({ kind: "none" })}
					onDone={(result) => {
						notify.success(
							t("toolbar.transfer_done", { accepted: result.accepted, skipped: result.skipped, failed: result.failed }),
						);
						setDialog({ kind: "none" });
						void afterWrite();
					}}
				/>
			)}
			{dialog.kind === "move" && (
				<TransferDialog
					mode="move"
					srcDir={path}
					names={selection.items.map((item) => item.name)}
					onClose={() => setDialog({ kind: "none" })}
					onDone={(result) => {
						notify.success(
							t("toolbar.transfer_done", { accepted: result.accepted, skipped: result.skipped, failed: result.failed }),
						);
						setDialog({ kind: "none" });
						void afterWrite();
					}}
				/>
			)}
			{dialog.kind === "delete" && (
				<DeleteDialog
					names={selection.items.map((item) => item.name)}
					onClose={() => setDialog({ kind: "none" })}
					onConfirm={async () => {
						const grouped = new Map<string, string[]>();
						for (const item of selection.items) {
							const dir = parentOf(item.path);
							grouped.set(dir, [...(grouped.get(dir) ?? []), item.name]);
						}
						try {
							let removed = 0;
							let failed = 0;
							for (const [dir, names] of grouped) {
								const result = await removePaths(dir, names);
								removed += result.removed.length;
								failed += result.failed.length;
								if (result.failed.length) notify.error(result.failed[0].error);
							}
							if (removed) notify.success(t("global.delete_success"));
							if (failed && !removed) notify.error(t("home.load_failed"));
							setDialog({ kind: "none" });
							await afterWrite();
						} catch (reason) {
							notify.error(reason);
						}
					}}
				/>
			)}
			{dialog.kind === "remove-empty" && (
				<RemoveEmptyDialog
					path={path}
					onClose={() => setDialog({ kind: "none" })}
					onConfirm={async () => {
						try {
							const result = await removeEmptyDirectories(path);
							notify.success(t("global.delete_success"), `${result.removed.length}`);
							setDialog({ kind: "none" });
							await afterWrite();
						} catch (reason) {
							notify.error(reason);
						}
					}}
				/>
			)}
			{dialog.kind === "upload" && (
				<UploadDialog
					directory={path}
					onClose={() => setDialog({ kind: "none" })}
					onUploaded={() => void afterWrite()}
				/>
			)}
			{dialog.kind === "search" && <SearchDialog startPath={path} onClose={() => setDialog({ kind: "none" })} />}
			{dialog.kind === "batch-rename" && (
				<BatchRenameDialog
					items={selection.items.length ? selection.items : items}
					onClose={() => setDialog({ kind: "none" })}
					onDone={() => {
						setDialog({ kind: "none" });
						void afterWrite();
					}}
				/>
			)}
			{dialog.kind === "recursive-move" && (
				<NameDialog
					title={t("toolbar.recursive_move")}
					initialValue=""
					hint={t("toolbar.recursive_move_directory-tips")}
					placeholder={t("toolbar.choose_dst_folder")}
					onClose={() => setDialog({ kind: "none" })}
					onSubmit={async (destination) => {
						try {
							const result = await movePaths({
								src_dir: path,
								dst_dir: normalizePath(destination),
								names: items.map((item) => item.name),
							});
							notify.success(
								t("toolbar.transfer_done", {
									accepted: result.accepted,
									skipped: result.skipped,
									failed: result.failed,
								}),
							);
							setDialog({ kind: "none" });
							await afterWrite();
						} catch (reason) {
							notify.error(reason);
						}
					}}
				/>
			)}

			<LocalSettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
			{menu && <ContextMenu position={menu} entries={menu.items} onClose={() => setMenu(null)} />}
		</div>
	);
}

/* --------------------------------------------------------------------- pieces */

/** The wordmark lockup used in the file header. */
function LogoLockup() {
	const t = useT();
	return (
		<>
			<span
				aria-hidden="true"
				className="flex size-10 items-center justify-center rounded-[25%] bg-foreground text-base font-bold text-background"
			>
				E
			</span>
			<span className="sr-only">{t("home.home")}</span>
		</>
	);
}

/** One icon in the floating cluster (§6.1). */
function ClusterButton({
	icon,
	label,
	show,
	active,
	onPress,
}: {
	icon: Parameters<typeof Icon>[0]["name"];
	label: string;
	show: boolean;
	active?: boolean;
	onPress: () => void;
}) {
	if (!show) return null;
	return (
		<button
			type="button"
			onClick={onPress}
			aria-label={label}
			title={label}
			aria-pressed={active}
			className={`tap flex size-8 items-center justify-center rounded-lg ${
				active ? "bg-main text-white" : "text-main hover:bg-main hover:text-white"
			}`}
		>
			<Icon name={icon} className="size-4" />
		</button>
	);
}

/**
 * The bulk bar (§6.2).
 *
 * Shown only when the checkbox mode is on and something is ticked, which is what §15's
 * condition table says. Every button is permission-gated individually — a missing
 * permission renders nothing rather than a disabled button, because a bar of greyed
 * icons tells the user less than a shorter bar.
 */
function SelectionBar({
	selection,
	permissions,
	writable,
	onRename,
	onCopy,
	onMove,
	onDelete,
	onDownload,
}: {
	selection: ReturnType<typeof useSelection>;
	permissions: ReturnType<typeof permissionsFor>;
	writable: boolean;
	onRename: () => void;
	onCopy: () => void;
	onMove: () => void;
	onDelete: () => void;
	onDownload: () => void;
}) {
	const t = useT();
	if (!selection.count) return null;
	return (
		<div className="arrive fixed bottom-4 left-1/2 z-overlay flex -translate-x-1/2 items-center gap-1 rounded-lg bg-surface/95 p-2 shadow-[0px_10px_30px_-5px_rgba(0,0,0,0.3)] backdrop-blur-md [--arrive-from:10px] [--arrive-scale:0.9] dark:bg-[#000000d0]">
			<span className="numeric px-1.5 text-[11px] text-neutral-11">{selection.count}</span>
			{permissions.rename.allowed && writable && (
				<BarButton icon="pencil" label={t("toolbar.rename")} onPress={onRename} />
			)}
			{permissions.move.allowed && writable && (
				<BarButton icon="folder-arrow" label={t("toolbar.move")} onPress={onMove} />
			)}
			{permissions.copy.allowed && writable && <BarButton icon="copy" label={t("toolbar.copy")} onPress={onCopy} />}
			{permissions.remove.allowed && writable && (
				<BarButton icon="trash" label={t("toolbar.delete")} onPress={onDelete} danger />
			)}
			{permissions.download.allowed && <BarButton icon="download" label={t("toolbar.download")} onPress={onDownload} />}
			<BarButton icon="close" label={t("toolbar.cancel_select")} onPress={selection.clear} />
		</div>
	);
}

function BarButton({
	icon,
	label,
	onPress,
	danger,
}: {
	icon: Parameters<typeof Icon>[0]["name"];
	label: string;
	onPress: () => void;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onPress}
			aria-label={label}
			title={label}
			className={`tap flex size-7 items-center justify-center rounded-md hover:bg-row-hover ${danger ? "text-danger-11" : "text-neutral-11"}`}
		>
			<Icon name={icon} className="size-4" />
		</button>
	);
}

/* ---------------------------------------------------------------- read helpers
 *
 * The preferences are read at render rather than pushed down as props, because the
 * browser is their only consumer and a dozen props threaded through three views is how
 * a view ends up with the wrong one.
 */

function readNavbarPosition() {
	return readPreferenceString("position_of_header_navbar", "static");
}

function readShowSidebar() {
	return readPreferenceString("show_sidebar", "none") === "visible";
}

function readShowCount() {
	return readPreferenceString("show_count_msg", "none") === "visible";
}

function readGridSize() {
	return readPreferenceNumber("grid_item_size", 90);
}

function readOverflow() {
	return readPreferenceString("list_item_filename_overflow", "ellipsis") as "ellipsis" | "scrollable" | "multi_line";
}

function readOpenOnCheckbox() {
	return readPreferenceString("open_item_on_checkbox", "direct") as "direct" | "dblclick" | "disable_while_checked";
}

function readFolderInImageView() {
	return readPreferenceString("show_folder_in_image_view", "top") as "top" | "bottom" | "none";
}

function readPreferenceString(key: Parameters<typeof getPreference>[0], fallback: string): string {
	const value = getPreference(key);
	return typeof value === "string" ? value : fallback;
}

function readPreferenceNumber(key: Parameters<typeof getPreference>[0], fallback: number): number {
	const value = getPreference(key);
	return typeof value === "number" ? value : fallback;
}

function readCheckboxMode(): boolean {
	return readFlag("checkbox-mode") === "on";
}

function writeCheckboxMode(on: boolean) {
	writeFlag("checkbox-mode", on ? "on" : "off");
}

/** The virtual path in the address bar, so a refresh and Back both work. */
function readPathFromLocation(): string {
	const pathname = globalThis.location?.pathname ?? "/";
	if (pathname.startsWith("/@")) return "/";
	try {
		return normalizePath(decodeURIComponent(pathname));
	} catch {
		return normalizePath(pathname);
	}
}

/** The scroll position, for §6.3's back-to-top tab. */
function useScrollPosition() {
	const [top, setTop] = useState(0);
	useEffect(() => {
		const onScroll = () => setTop(globalThis.scrollY);
		globalThis.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
		return () => globalThis.removeEventListener("scroll", onScroll);
	}, []);
	return top;
}

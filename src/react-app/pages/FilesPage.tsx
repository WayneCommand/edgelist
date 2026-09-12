import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button as HeroButton, Skeleton } from "@heroui/react";
import { useLocation, useNavigate } from "react-router";
import { api, fetchFileResponse } from "../lib/api";
import { collectRemovals, groupByParent, summarizeBatch, type RemoveOutcome } from "../lib/batch";
import { directoriesToCreate, targetPath, type DroppedTree } from "../lib/dropUpload";
import { fileActions } from "../lib/fileActions";
import { permissionsFor } from "../lib/mask";
import type { MenuPosition } from "../lib/menu";
import { clampPage, perPageFor } from "../lib/pagination";
import { crumbsOf } from "../lib/paths";
import { isPreviewable, needsText, previewKindFor, withMime, type PreviewKind } from "../lib/preview";
import { unwritableHint } from "../lib/transfer";
import {
	DEFAULT_PAGE_MODE,
	DEFAULT_PAGE_SIZE,
	DEFAULT_SORT_STATE,
	DEFAULT_VIEW_MODE,
	PAGE_MODE_KEY,
	PAGE_SIZE_KEY,
	VIEW_MODE_KEY,
	nextSortState,
	parsePageMode,
	parsePageSize,
	parseSortState,
	parseViewMode,
	serializePageSize,
	serializeSortState,
	sortKeyFor,
	type PageMode,
} from "../lib/preferences";
import type { FileItem, FileListResponse, SortField, Storage, TransferMode } from "../lib/types";
import { ROUTES, filesPathFor } from "../routes";
import { useConfirm } from "../hooks/useConfirm";
import { useNotify } from "../hooks/useNotify";
import { useSelection } from "../hooks/useSelection";
import { useStoredState } from "../hooks/useStoredState";
import { Modal } from "../components/common/Modal";
import { ContextMenu } from "../components/files/ContextMenu";
import { DropZone } from "../components/files/DropZone";
import { FileGrid } from "../components/files/FileGrid";
import { FileListSkeleton } from "../components/files/FileListSkeleton";
import { FileTable } from "../components/files/FileTable";
import { FileToolbar } from "../components/files/FileToolbar";
import { Pager } from "../components/files/Pager";
import { PathBar } from "../components/files/PathBar";
import { FilePreview } from "../components/files/preview";
import { SelectionBar } from "../components/files/SelectionBar";
import { TransferDialog } from "../components/files/TransferDialog";

export function FilesPage() {
	const notify = useNotify();
	const confirm = useConfirm();
	const navigate = useNavigate();
	const initialPath = filesPathFor(useLocation().pathname);

	const [path, setPath] = useState(initialPath);
	const [items, setItems] = useState<FileItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [page, setPage] = useState(1);
	// What the server says the directory holds, not how much of it we hold.
	const [total, setTotal] = useState(0);
	const [loadingMore, setLoadingMore] = useState(false);
	const [folderName, setFolderName] = useState<string | null>(null);
	const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
	const [renameName, setRenameName] = useState("");
	// What the previewer is showing. `text` is set for the kinds that need the
	// file as text and `url` for the ones that need it as bytes — never both.
	const [preview, setPreview] = useState<{ item: FileItem; kind: PreviewKind; text?: string; url?: string } | null>(
		null,
	);
	const [previewText, setPreviewText] = useState("");
	const [previewDirty, setPreviewDirty] = useState(false);
	const [previewSaving, setPreviewSaving] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);

	// The binary viewers get an object URL, which holds its blob until it is
	// revoked. Tying the revocation to the URL itself covers every way the
	// preview ends — closed, replaced by another file, or the page navigating
	// away — without the close handler having to remember to do it.
	const previewUrl = preview?.url;
	useEffect(() => {
		if (!previewUrl) return;
		return () => URL.revokeObjectURL(previewUrl);
	}, [previewUrl]);
	const [transfer, setTransfer] = useState<{ mode: TransferMode; dir: string; names: string[] } | null>(null);
	const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
	// Which paths a storage is mounted at. `null` means "not known yet" — a failed
	// read is not the same answer as "nothing is mounted", and gating on the
	// latter would lock every button in the app on a transient error.
	const [mounts, setMounts] = useState<string[] | null>(null);
	const [menu, setMenu] = useState<MenuPosition | null>(null);
	const [storedView, setStoredView] = useStoredState(VIEW_MODE_KEY, DEFAULT_VIEW_MODE);
	const view = parseViewMode(storedView);
	// The sort order is remembered per directory, keyed off the URL rather than
	// `path` so a navigation reads the new directory's order straight away.
	const [storedSort, setStoredSort] = useStoredState(sortKeyFor(initialPath), serializeSortState(DEFAULT_SORT_STATE));
	// `storedSort` is a plain string, so the parsed object keeps a stable identity
	// and `load` does not change on every render.
	const sort = useMemo(() => parseSortState(storedSort), [storedSort]);
	const [storedPageSize, setStoredPageSize] = useStoredState(PAGE_SIZE_KEY, serializePageSize(DEFAULT_PAGE_SIZE));
	const [storedPageMode, setStoredPageMode] = useStoredState(PAGE_MODE_KEY, DEFAULT_PAGE_MODE);
	const pageSize = parsePageSize(storedPageSize);
	const pageMode = parsePageMode(storedPageMode);

	const selection = useSelection(items);
	const clearSelection = selection.clear;
	const single = selection.count === 1 ? selection.items[0] : null;
	// One source of truth for what is possible, shared by the bar and the menu.
	const permissions = permissionsFor(selection.items);
	// The same idea for the directory itself: three actions here create entries —
	// New folder and the two uploads — and all three fail identically when no
	// storage serves this path, so they share one reason.
	const writeHint = unwritableHint(path, mounts);

	function openDirectory(next: string) {
		navigate({ pathname: ROUTES.files(next) });
	}

	// The directory is passed in, so this callback only changes when the query
	// does — a new sort order or page size re-runs the effect below.
	const load = useCallback(
		async (nextPath: string, nextPage = 1, append = false) => {
			if (append) setLoadingMore(true);
			else setLoading(true);
			setError("");
			// Growing the list keeps the selection; replacing it cannot.
			if (!append) clearSelection();
			try {
				const data = await api<FileListResponse>("/api/fs/list", {
					method: "POST",
					body: JSON.stringify({
						path: nextPath,
						page: nextPage,
						per_page: perPageFor(pageSize, "list"),
						order_by: sort.field,
						order_direction: sort.direction,
					}),
				});
				setTotal(data.total ?? 0);
				setItems((previous) => (append ? [...previous, ...(data.content ?? [])] : (data.content ?? [])));
			} catch (reason) {
				setError(reason instanceof Error ? reason.message : "Unable to load files");
				// A typed path can point somewhere that does not exist. Leaving the
				// previous directory's entries on screen under the new breadcrumb would
				// read as "this directory holds those files", so clear them and let the
				// error be the only thing shown.
				if (!append) {
					setItems([]);
					setTotal(0);
				}
			} finally {
				if (append) setLoadingMore(false);
				else setLoading(false);
			}
			// The address is where the user actually is, even when the listing failed;
			// the crumbs follow it rather than the last directory that worked.
			setPath(nextPath);
			setPage(nextPage);
		},
		[clearSelection, pageSize, sort],
	);

	// Search results belong to the directory they were run in, so leaving it — by
	// link or by the back button — drops the search. This is separate from the
	// fetch below so that changing the sort does not wipe a typed query.
	useEffect(() => {
		setSearching(false);
		setQuery("");
	}, [initialPath]);

	// The mount list is what tells the client whether a directory can be written
	// to at all: the worker resolves a path by longest prefix over the mounts, so
	// a path under none of them has nowhere to put a file. It is fetched once —
	// storages are edited on their own page, and a stale answer only ever costs a
	// button that the server would refuse anyway.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const data = await api<{ content: Storage[] }>("/api/admin/storage/list");
				if (cancelled) return;
				setMounts(
					(data.content ?? [])
						.map((item) => item?.mount_path)
						.filter((mount): mount is string => typeof mount === "string"),
				);
			} catch {
				// Unknown, not empty: gating on a failed read would grey out every
				// write button on what is very likely a blip.
				if (!cancelled) setMounts(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// The sort order is part of the request, so a new order re-fetches the listing.
	useEffect(() => {
		void load(initialPath);
	}, [initialPath, load]);

	// Search results page exactly like a listing does, so the pager below the
	// list can drive either one.
	async function search(event?: FormEvent, nextPage = 1, append = false) {
		event?.preventDefault();
		if (!query.trim()) {
			await load(path);
			return;
		}
		setSearching(true);
		if (append) setLoadingMore(true);
		else setLoading(true);
		setError("");
		if (!append) clearSelection();
		try {
			const data = await api<FileListResponse>("/api/fs/search", {
				method: "POST",
				body: JSON.stringify({
					parent: path,
					keywords: query,
					scope: 0,
					page: nextPage,
					per_page: perPageFor(pageSize, "search"),
				}),
			});
			setPage(nextPage);
			setTotal(data.total ?? 0);
			setItems((previous) => (append ? [...previous, ...(data.content ?? [])] : (data.content ?? [])));
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Unable to search files");
		} finally {
			if (append) setLoadingMore(false);
			else setLoading(false);
		}
	}

	async function createFolder(event: FormEvent) {
		event.preventDefault();
		if (folderName === null) return;
		try {
			await api("/api/fs/mkdir", {
				method: "POST",
				body: JSON.stringify({ path: `${path.replace(/\/$/, "")}/${folderName}` }),
			});
			notify("Folder created");
			setFolderName(null);
			await load(path, page);
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to create folder", true);
		}
	}

	async function rename(event: FormEvent) {
		event.preventDefault();
		if (!renameTarget) return;
		try {
			await api("/api/fs/rename", {
				method: "POST",
				body: JSON.stringify({ path: renameTarget.path, name: renameName, overwrite: false }),
			});
			notify("Renamed");
			setRenameTarget(null);
			await load(path, page);
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to rename", true);
		}
	}

	async function removeSelected() {
		const targets = selection.items;
		if (!targets.length) return;
		const question = targets.length === 1 ? `Delete ${targets[0].name}?` : `Delete ${targets.length} items?`;
		if (!(await confirm({ title: "Delete", message: question }))) return;
		try {
			// Search results can span directories, so one request per directory.
			const settled = await Promise.allSettled(
				[...groupByParent(targets)].map(([dir, names]) =>
					api<RemoveOutcome>("/api/fs/remove", { method: "POST", body: JSON.stringify({ dir, names }) }),
				),
			);
			const summary = summarizeBatch(collectRemovals(settled), "item");
			notify(summary.message, summary.error);
			// Deleting the last entry of the last page would otherwise leave an empty
			// page behind, so land on one that still has entries.
			await load(path, clampPage(page, total - targets.length, pageSize));
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to delete", true);
		}
	}

	async function upload(tree: DroppedTree) {
		if (!tree.files.length) return;
		setUploading({ done: 0, total: tree.files.length });
		try {
			// Drivers that are not object stores (WebDAV) reject a PUT whose parent
			// collection is missing, so the dropped tree is created first, parents
			// before children. Failures here are swallowed on purpose: "already
			// exists" is the common case for a re-drop, and the PUT that follows is
			// the authoritative test — if the directory genuinely could not be
			// made, the upload reports it per file.
			for (const directory of directoriesToCreate(tree.directories)) {
				try {
					await api("/api/fs/mkdir", {
						method: "POST",
						body: JSON.stringify({ path: targetPath(path, directory) }),
					});
				} catch {
					// Deliberately ignored — see the note above.
				}
			}
			let uploaded = 0;
			let failed = 0;
			for (const dropped of tree.files) {
				try {
					await api("/api/fs/put", {
						method: "PUT",
						headers: {
							"File-Path": encodeURIComponent(targetPath(path, dropped.path)),
							"Content-Type": dropped.file.type || "application/octet-stream",
						},
						body: dropped.file,
					});
					uploaded += 1;
				} catch (reason) {
					failed += 1;
					notify(reason instanceof Error ? reason.message : `Unable to upload ${dropped.path}`, true);
				} finally {
					setUploading({ done: uploaded + failed, total: tree.files.length });
				}
			}
			if (uploaded) {
				notify(uploaded === 1 ? "Uploaded" : `Uploaded ${uploaded} files`);
				// An upload invalidates whatever search produced the current listing,
				// so fall back to a plain view of the directory that was written to.
				setSearching(false);
				setQuery("");
				await load(path, page);
			}
		} finally {
			setUploading(null);
		}
	}

	async function download(items: FileItem[]) {
		// Sequential on purpose: browsers throttle parallel blob downloads, and a
		// failure on one entry should not abort the rest.
		for (const item of items) {
			try {
				const blob = await (await fetchFileResponse(item.path)).blob();
				const link = document.createElement("a");
				link.href = URL.createObjectURL(blob);
				link.download = item.name;
				link.click();
				URL.revokeObjectURL(link.href);
			} catch (reason) {
				notify(reason instanceof Error ? reason.message : `Unable to download ${item.name}`, true);
			}
		}
	}

	async function copyLink(item: FileItem) {
		try {
			const data = await api<{ url: string }>("/api/fs/link", {
				method: "POST",
				body: JSON.stringify({ path: item.path }),
			});
			// The worker answers with a path-relative `/d...`, which is only useful
			// once it is absolute.
			await navigator.clipboard.writeText(new URL(data.url, window.location.origin).href);
			notify("Link copied");
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to copy link", true);
		}
	}

	function startRename(item: FileItem) {
		setRenameName(item.name);
		setRenameTarget(item);
	}

	// The API names one source directory per request, so a selection that spans
	// directories (a search) has nothing to send. The bar greys the buttons out;
	// this is the belt to that braces.
	function startTransfer(mode: TransferMode) {
		const grouped = groupByParent(selection.items);
		if (grouped.size !== 1) return;
		const [dir, names] = [...grouped][0];
		setTransfer({ mode, dir, names });
	}

	async function previewFile(item: FileItem) {
		const kind = previewKindFor(item.name, item.size);
		// Kinds with nothing to fetch: an Office document has no renderer here, and
		// a file past the buffering limit is refused before any bytes move. Both get
		// a panel that says so.
		if (kind === "office" || kind === "toolarge") {
			setPreview({ item, kind });
			return;
		}
		setPreviewLoading(true);
		try {
			const response = await fetchFileResponse(item.path);
			if (needsText(kind)) {
				const text = await response.text();
				setPreview({ item, kind, text });
				setPreviewText(text);
				setPreviewDirty(false);
			} else {
				setPreview({ item, kind, url: URL.createObjectURL(withMime(await response.blob(), item.name)) });
			}
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to preview file", true);
		} finally {
			setPreviewLoading(false);
		}
	}

	async function savePreview() {
		if (!preview) return;
		setPreviewSaving(true);
		try {
			await api("/api/fs/put", {
				method: "PUT",
				headers: {
					"File-Path": encodeURIComponent(preview.item.path),
					"Content-Type": "text/plain; charset=utf-8",
				},
				body: new Blob([previewText], { type: "text/plain; charset=utf-8" }),
			});
			setPreview({ ...preview, text: previewText });
			setPreviewDirty(false);
			notify("Saved");
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to save file", true);
		} finally {
			setPreviewSaving(false);
		}
	}

	async function closePreview() {
		if (
			previewDirty &&
			!(await confirm({ title: "Discard changes", message: "Discard unsaved changes?", confirmLabel: "Discard" }))
		)
			return;
		setPreview(null);
		setPreviewText("");
		setPreviewDirty(false);
	}

	const changeSort = useCallback(
		(field: SortField) => setStoredSort(serializeSortState(nextSortState(sort, field))),
		[setStoredSort, sort],
	);

	// Search results and directory listings are paged by the same control, so the
	// two destinations live behind one pair of helpers.
	function goToPage(nextPage: number) {
		if (searching) void search(undefined, nextPage);
		else void load(path, nextPage);
	}

	function loadMore() {
		if (searching) void search(undefined, page + 1, true);
		else void load(path, page + 1, true);
	}

	// Changing the page size re-runs the effect above, because `load` reads it.
	function changePageSize(size: number) {
		setStoredPageSize(serializePageSize(size));
	}

	// The appended pages only make sense while the list keeps growing, so switching
	// back to paged mode starts from the top.
	function changePageMode(next: PageMode) {
		setStoredPageMode(next);
		if (searching) void search(undefined, 1);
		else void load(path, 1);
	}

	async function openFile(item: FileItem) {
		if (item.is_dir) {
			openDirectory(item.path);
			return;
		}
		// A file past its previewer's ceiling is still "previewable": it opens a
		// panel that says why it cannot be shown, rather than silently downloading.
		if (!isPreviewable(item.name, item.size)) {
			await download([item]);
			return;
		}
		await previewFile(item);
	}

	// Right clicking an entry that is not part of the selection makes it the
	// selection first, the way a file manager does, so the menu always describes
	// what the user pointed at.
	function openMenu(item: FileItem, index: number, position: MenuPosition) {
		if (!selection.isSelected(item.path)) selection.selectOnly(item, index);
		setMenu(position);
	}

	const crumbs = crumbsOf(path);
	// Search results arrive ranked by the server, so the headers only re-sort a
	// real directory listing.
	const sortable = searching ? undefined : { state: sort, change: changeSort };
	// The floating selection bar sits over the end of the list; the padding keeps
	// the last row reachable instead of permanently covered. The drop zone goes
	// quiet when the directory cannot take a file, so a drag does not raise an
	// overlay promising an upload that would be refused.
	return (
		<DropZone onDrop={(tree) => void upload(tree)} disabled={uploading !== null || writeHint !== null}>
			<section className={selection.count > 0 ? "pb-24" : undefined}>
				<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-sm text-muted">Files</p>
						<h1 className="mt-1 text-2xl font-semibold">
							{searching ? `Search: ${query}` : path === "/" ? "All files" : crumbs[crumbs.length - 1]?.name}
						</h1>
					</div>
				</div>
				<form className="mb-4 flex gap-2" onSubmit={search}>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search files…"
						className="min-w-0 flex-1 rounded-lg border border-border bg-field-background px-3 py-2 text-sm outline-none focus:border-focus"
					/>
					<HeroButton type="submit" size="sm" variant="secondary">
						Search
					</HeroButton>
					{searching && (
						<HeroButton
							type="button"
							size="sm"
							variant="ghost"
							onPress={() => {
								setQuery("");
								setSearching(false);
								void load(path);
							}}
						>
							Clear
						</HeroButton>
					)}
				</form>
				<PathBar
					path={path}
					crumbs={crumbs}
					searching={searching}
					onNavigate={(next) => {
						setSearching(false);
						openDirectory(next);
					}}
				/>
				<FileToolbar
					selection={selection}
					view={view}
					uploading={uploading}
					writeHint={writeHint}
					onViewChange={setStoredView}
					onRefresh={() => void load(path, page)}
					onNewFolder={() => setFolderName("")}
					onUpload={(tree) => void upload(tree)}
				/>
				<SelectionBar
					selection={selection}
					permissions={permissions}
					onRename={() => single && startRename(single)}
					onCopy={() => startTransfer("copy")}
					onMove={() => startTransfer("move")}
					onDelete={() => void removeSelected()}
					onDownload={() => void download(selection.items)}
					onCopyLink={() => single && void copyLink(single)}
				/>
				<section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
					{error && (
						<p className="border-b border-danger/20 bg-danger-soft px-5 py-3 text-sm text-danger-soft-foreground">
							{error}
						</p>
					)}
					{loading ? (
						<FileListSkeleton view={view} />
					) : !items.length ? (
						<div className="p-16 text-center text-sm text-muted">No files found</div>
					) : view === "grid" ? (
						<FileGrid
							items={items}
							selection={selection}
							onOpen={(item) => void openFile(item)}
							onContextMenu={openMenu}
						/>
					) : (
						<FileTable
							items={items}
							selection={selection}
							sort={sortable?.state}
							onSort={sortable?.change}
							onOpen={(item) => void openFile(item)}
							onContextMenu={openMenu}
						/>
					)}
				</section>
				<Pager
					mode={pageMode}
					page={page}
					pageSize={pageSize}
					total={total}
					loading={loadingMore}
					onPage={goToPage}
					onPageSize={changePageSize}
					onMode={changePageMode}
					onLoadMore={loadMore}
				/>
				{folderName !== null && (
					<Modal title="New folder" onClose={() => setFolderName(null)}>
						<form className="space-y-4" onSubmit={createFolder}>
							<input
								autoFocus
								required
								value={folderName}
								onChange={(event) => setFolderName(event.target.value)}
								placeholder="Folder name"
								className="w-full rounded-lg border border-border bg-field-background px-3 py-2 outline-none focus:border-focus"
							/>
							<HeroButton type="submit" fullWidth>
								Create
							</HeroButton>
						</form>
					</Modal>
				)}
				{renameTarget && (
					<Modal title="Rename" onClose={() => setRenameTarget(null)}>
						<form className="space-y-4" onSubmit={rename}>
							<input
								autoFocus
								required
								value={renameName}
								onChange={(event) => setRenameName(event.target.value)}
								className="w-full rounded-lg border border-border bg-field-background px-3 py-2 outline-none focus:border-focus"
							/>
							<HeroButton type="submit" fullWidth>
								Save
							</HeroButton>
						</form>
					</Modal>
				)}
				{previewLoading && (
					<Modal title="Preview" onClose={() => setPreviewLoading(false)}>
						<Skeleton className="h-48 w-full rounded-lg" />
					</Modal>
				)}
				{preview && (
					<FilePreview
						source={preview}
						dirty={previewDirty}
						saving={previewSaving}
						onChange={(text) => {
							setPreviewText(text);
							setPreviewDirty(text !== preview.text);
						}}
						onSave={() => void savePreview()}
						onDownload={() => void download([preview.item])}
						onClose={() => void closePreview()}
					/>
				)}
				{transfer && (
					<TransferDialog
						mode={transfer.mode}
						srcDir={transfer.dir}
						names={transfer.names}
						mounts={mounts}
						onClose={() => setTransfer(null)}
						// A transfer changes the listing and may move the selection out of
						// it, so reload rather than patching state in place.
						onTransferred={() => void load(path, page)}
					/>
				)}
				{menu && (
					<ContextMenu
						position={menu}
						items={fileActions(permissions, {
							open: () => single && void openFile(single),
							rename: () => single && startRename(single),
							copy: () => startTransfer("copy"),
							move: () => startTransfer("move"),
							remove: () => void removeSelected(),
							download: () => void download(selection.items),
							link: () => single && void copyLink(single),
						})}
						onClose={() => setMenu(null)}
					/>
				)}
			</section>
		</DropZone>
	);
}

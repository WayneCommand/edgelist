import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button as HeroButton, Skeleton } from "@heroui/react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../lib/api";
import { collectRemovals, groupByParent, summarizeBatch, type RemoveOutcome } from "../lib/batch";
import { languageForFile } from "../lib/format";
import {
	DEFAULT_SORT_STATE,
	DEFAULT_VIEW_MODE,
	VIEW_MODE_KEY,
	nextSortState,
	parseSortState,
	parseViewMode,
	serializeSortState,
	sortKeyFor,
} from "../lib/preferences";
import type { FileItem, FileListResponse, SortField, TransferMode } from "../lib/types";
import { ROUTES, filesPathFor } from "../routes";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useNotify } from "../hooks/useNotify";
import { useSelection } from "../hooks/useSelection";
import { useStoredState } from "../hooks/useStoredState";
import { Modal } from "../components/common/Modal";
import { FileGrid } from "../components/files/FileGrid";
import { FileListSkeleton } from "../components/files/FileListSkeleton";
import { FilePreviewModal } from "../components/files/FilePreviewModal";
import { FileTable } from "../components/files/FileTable";
import { FileToolbar } from "../components/files/FileToolbar";
import { SelectionBar } from "../components/files/SelectionBar";
import { TransferDialog } from "../components/files/TransferDialog";

const PAGE_SIZE = 200;

export function FilesPage() {
	const notify = useNotify();
	const confirm = useConfirm();
	const { token } = useAuth();
	const navigate = useNavigate();
	const initialPath = filesPathFor(useLocation().pathname);

	const [path, setPath] = useState(initialPath);
	const [items, setItems] = useState<FileItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [folderName, setFolderName] = useState<string | null>(null);
	const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
	const [renameName, setRenameName] = useState("");
	const [preview, setPreview] = useState<{ item: FileItem; content: string } | null>(null);
	const [previewContent, setPreviewContent] = useState("");
	const [previewDirty, setPreviewDirty] = useState(false);
	const [previewSaving, setPreviewSaving] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [transfer, setTransfer] = useState<{ mode: TransferMode; dir: string; names: string[] } | null>(null);
	const [storedView, setStoredView] = useStoredState(VIEW_MODE_KEY, DEFAULT_VIEW_MODE);
	const view = parseViewMode(storedView);
	// The sort order is remembered per directory, keyed off the URL rather than
	// `path` so a navigation reads the new directory's order straight away.
	const [storedSort, setStoredSort] = useStoredState(sortKeyFor(initialPath), serializeSortState(DEFAULT_SORT_STATE));
	// `storedSort` is a plain string, so the parsed object keeps a stable identity
	// and `load` does not change on every render.
	const sort = useMemo(() => parseSortState(storedSort), [storedSort]);

	const selection = useSelection(items);
	const clearSelection = selection.clear;
	const single = selection.count === 1 ? selection.items[0] : null;

	function openDirectory(next: string) {
		navigate({ pathname: ROUTES.files(next) });
	}

	// The directory is passed in, so this callback only changes when the sort does.
	const load = useCallback(
		async (nextPath: string) => {
			setLoading(true);
			setError("");
			clearSelection();
			try {
				const data = await api<FileListResponse>("/api/fs/list", {
					method: "POST",
					body: JSON.stringify({
						path: nextPath,
						page: 1,
						per_page: PAGE_SIZE,
						order_by: sort.field,
						order_direction: sort.direction,
					}),
				});
				setPath(nextPath);
				setItems(data.content ?? []);
			} catch (reason) {
				setError(reason instanceof Error ? reason.message : "Unable to load files");
			} finally {
				setLoading(false);
			}
		},
		[clearSelection, sort],
	);

	// Search results belong to the directory they were run in, so leaving it — by
	// link or by the back button — drops the search. This is separate from the
	// fetch below so that changing the sort does not wipe a typed query.
	useEffect(() => {
		setSearching(false);
		setQuery("");
	}, [initialPath]);

	// The sort order is part of the request, so a new order re-fetches the listing.
	useEffect(() => {
		void load(initialPath);
	}, [initialPath, load]);

	async function search(event?: FormEvent) {
		event?.preventDefault();
		if (!query.trim()) {
			await load(path);
			return;
		}
		setSearching(true);
		setLoading(true);
		setError("");
		clearSelection();
		try {
			const data = await api<FileListResponse>("/api/fs/search", {
				method: "POST",
				body: JSON.stringify({ parent: path, keywords: query, scope: 0, page: 1, per_page: PAGE_SIZE }),
			});
			setItems(data.content ?? []);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Unable to search files");
		} finally {
			setLoading(false);
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
			await load(path);
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
			await load(path);
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
			await load(path);
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to delete", true);
		}
	}

	async function upload(files: FileList) {
		let uploaded = 0;
		for (const file of files) {
			try {
				await api("/api/fs/put", {
					method: "PUT",
					headers: {
						"File-Path": encodeURIComponent(`${path.replace(/\/$/, "")}/${file.name}`),
						"Content-Type": file.type || "application/octet-stream",
					},
					body: file,
				});
				uploaded += 1;
			} catch (reason) {
				notify(reason instanceof Error ? reason.message : `Unable to upload ${file.name}`, true);
			}
		}
		if (uploaded) {
			notify(uploaded === 1 ? "Uploaded" : `Uploaded ${uploaded} files`);
			await load(path);
		}
	}

	async function download(items: FileItem[]) {
		// Sequential on purpose: browsers throttle parallel blob downloads, and a
		// failure on one entry should not abort the rest.
		for (const item of items) {
			try {
				const response = await fetch(`/d${item.path}`, { headers: { Authorization: token } });
				if (!response.ok) throw new Error(`Download failed: ${item.name}`);
				const blob = await response.blob();
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

	function isPreviewable(name: string) {
		return languageForFile(name) !== null;
	}

	async function previewFile(item: FileItem) {
		setPreviewLoading(true);
		try {
			const response = await fetch(`/d${item.path}`, { headers: { Authorization: token } });
			if (!response.ok) throw new Error("Unable to preview file");
			const content = await response.text();
			setPreview({ item, content });
			setPreviewContent(content);
			setPreviewDirty(false);
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
				headers: { "File-Path": encodeURIComponent(preview.item.path), "Content-Type": "text/plain; charset=utf-8" },
				body: new Blob([previewContent], { type: "text/plain; charset=utf-8" }),
			});
			setPreview({ ...preview, content: previewContent });
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
		setPreviewContent("");
		setPreviewDirty(false);
	}

	const changeSort = useCallback(
		(field: SortField) => setStoredSort(serializeSortState(nextSortState(sort, field))),
		[setStoredSort, sort],
	);

	async function openFile(item: FileItem) {
		if (item.is_dir) {
			openDirectory(item.path);
			return;
		}
		if (isPreviewable(item.name)) {
			await previewFile(item);
			return;
		}
		await download([item]);
	}

	const crumbs = path.split("/").filter(Boolean);
	// Search results arrive ranked by the server, so the headers only re-sort a
	// real directory listing.
	const sortable = searching ? undefined : { state: sort, change: changeSort };
	// The floating selection bar sits over the end of the list; the padding keeps
	// the last row reachable instead of permanently covered.
	return (
		<section className={selection.count > 0 ? "pb-24" : undefined}>
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-sm text-muted">Files</p>
					<h1 className="mt-1 text-2xl font-semibold">
						{searching ? `Search: ${query}` : path === "/" ? "All files" : crumbs[crumbs.length - 1]}
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
			<div className="mb-4 flex items-center gap-2 text-sm text-muted">
				<button
					onClick={() => {
						setSearching(false);
						openDirectory("/");
					}}
					className="hover:text-accent"
				>
					Root
				</button>
				{!searching &&
					crumbs.map((part, index) => {
						const crumb = `/${crumbs.slice(0, index + 1).join("/")}`;
						return (
							<span key={crumb}>
								/{" "}
								<button onClick={() => openDirectory(crumb)} className="hover:text-accent">
									{part}
								</button>
							</span>
						);
					})}
			</div>
			<FileToolbar
				selection={selection}
				view={view}
				onViewChange={setStoredView}
				onRefresh={() => void load(path)}
				onNewFolder={() => setFolderName("")}
				onUpload={(files) => void upload(files)}
			/>
			<SelectionBar
				selection={selection}
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
					<FileGrid items={items} selection={selection} onOpen={(item) => void openFile(item)} />
				) : (
					<FileTable
						items={items}
						selection={selection}
						sort={sortable?.state}
						onSort={sortable?.change}
						onOpen={(item) => void openFile(item)}
					/>
				)}
			</section>
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
				<FilePreviewModal
					item={preview.item}
					content={previewContent}
					dirty={previewDirty}
					saving={previewSaving}
					onChange={(content) => {
						setPreviewContent(content);
						setPreviewDirty(content !== preview.content);
					}}
					onSave={() => void savePreview()}
					onClose={() => void closePreview()}
				/>
			)}
			{transfer && (
				<TransferDialog
					mode={transfer.mode}
					srcDir={transfer.dir}
					names={transfer.names}
					onClose={() => setTransfer(null)}
					// A transfer changes the listing and may move the selection out of
					// it, so reload rather than patching state in place.
					onTransferred={() => void load(path)}
				/>
			)}
		</section>
	);
}

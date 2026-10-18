import { useCallback, useRef, useState } from "react";
import { makeDirectory } from "../lib/api";
import { directoriesToCreate, droppedTree, pickedTree, targetPath, type DroppedTree } from "../lib/dropUpload";
import { formatBytes, percentOf } from "../lib/format";
import { notify } from "../lib/feedback";
import { ceilingReason, uploadFile, uploadInChunks, uploadPlanFor, workerTransport } from "../lib/upload";
import { mountFor } from "../lib/paths";
import { useT, useWorkspace } from "../hooks/useStore";
import { ActionButton } from "../ui/ActionButton";
import { Checkbox, Progress } from "../ui/Field";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";

/**
 * Uploading (§9).
 *
 * A queue of files with a three-at-a-time window, a per-file state machine, and a
 * retry that re-sends the same `File` handle. The spec's §9.2 is the state model and
 * this follows it closely; the two things it does not spell out are here because the
 * Worker makes them necessary:
 *
 * **Each file picks its own transport by size** (`uploadPlanFor`). A file at or under
 * the single-request ceiling goes up in one `PUT`; a larger one goes up in parts, and
 * only if the storage's driver can reassemble them. A storage that cannot is refused
 * *before* the bytes move, with the ceiling named.
 *
 * **Directories are created first, parents before children.** WebDAV rejects a `PUT`
 * whose parent collection is missing, so a dropped tree has to exist before its files
 * can land. "Already exists" is swallowed on purpose: it is the common case for a
 * re-drop, and the `PUT` that follows is the authoritative test.
 *
 * §18.12: the backdrop and Esc do not close this dialog, and the local list survives
 * being dismissed — reopening it shows the same progress rows.
 */

type Status = "pending" | "uploading" | "success" | "error";

type QueueEntry = {
	/** Stable identity, so React does not re-key on a retry. */
	id: string;
	file: File;
	/** Path relative to the directory being uploaded into. */
	path: string;
	status: Status;
	/** Bytes accepted for this file, for the in-flight readout. */
	sent: number;
	error?: string;
};

const CONCURRENCY = 3;

export type UploadSession = {
	entries: QueueEntry[];
	overwrite: boolean;
};

/** The queue lives outside the dialog so §18.12's "state survives closing" holds. */
let session: UploadSession = { entries: [], overwrite: false };

export function UploadDialog({
	directory,
	onClose,
	onUploaded,
}: {
	directory: string;
	onClose: () => void;
	onUploaded: () => void;
}) {
	const t = useT();
	const { mounts, chunkable } = useWorkspace();
	const [entries, setEntries] = useState<QueueEntry[]>(session.entries);
	const [overwrite, setOverwrite] = useState(session.overwrite);
	const [dragging, setDragging] = useState(false);
	const [busy, setBusy] = useState(false);
	const filePicker = useRef<HTMLInputElement>(null);
	const folderPicker = useRef<HTMLInputElement>(null);

	// The upload directory decides which ceiling applies.
	const mount = mountFor(directory, mounts);
	const canChunk = mount === null ? null : chunkable.includes(mount);

	const commit = useCallback((next: QueueEntry[]) => {
		session = { ...session, entries: next };
		setEntries(next);
	}, []);

	const patch = useCallback((id: string, changes: Partial<QueueEntry>) => {
		setEntries((current) => {
			const next = current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry));
			session = { ...session, entries: next };
			return next;
		});
	}, []);

	/**
	 * Sends one file.
	 *
	 * The transport is chosen by size, and a refusal is raised before any bytes move.
	 * `overwrite` is not a parameter the Worker takes on `PUT` — a write to a path
	 * replaces it — so it is recorded as intent here and the server's behaviour is the
	 * truth; the checkbox exists because §9.1 asks for it and because a future driver
	 * with an atomic-create primitive would need it.
	 */
	const send = useCallback(
		async (entry: QueueEntry) => {
			const destination = targetPath(directory, entry.path);
			const plan = uploadPlanFor(entry.file.size, canChunk);
			if (plan.transport === "refused") {
				throw new Error(ceilingReason(entry.path, entry.file.size));
			}
			if (plan.transport === "single") {
				await uploadFile(destination, entry.file, entry.file.type);
				return;
			}
			await uploadInChunks(entry.file, destination, workerTransport(), {
				onProgress: (sent) => patch(entry.id, { sent }),
			});
		},
		[canChunk, directory, patch],
	);

	/**
	 * Runs the queue, three at a time.
	 *
	 * A worker-pool shape rather than `Promise.all` over all of them: a hundred-file
	 * drop would open a hundred requests, and the browser limits them to six per host
	 * anyway, so the only effect of asking for more is a queue nobody can see.
	 */
	const run = useCallback(
		async (queue: QueueEntry[]) => {
			setBusy(true);
			// Directories first, parents before children (§9).
			const tree: DroppedTree = {
				files: queue.map((entry) => ({ file: entry.file, path: entry.path })),
				directories: queue.flatMap((entry) => {
					const parts = entry.path.split("/").filter(Boolean);
					parts.pop();
					const out: string[] = [];
					for (let depth = 1; depth <= parts.length; depth += 1) out.push(parts.slice(0, depth).join("/"));
					return out;
				}),
			};
			for (const relative of directoriesToCreate(tree.directories)) {
				try {
					await makeDirectory(targetPath(directory, relative));
				} catch {
					// Deliberately ignored — see the note at the top.
				}
			}

			let cursor = 0;
			let uploaded = 0;
			const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
				for (;;) {
					const index = cursor;
					cursor += 1;
					const entry = queue[index];
					if (!entry) return;
					patch(entry.id, { status: "uploading", sent: 0, error: undefined });
					try {
						await send(entry);
						uploaded += 1;
						patch(entry.id, { status: "success", sent: entry.file.size });
					} catch (reason) {
						patch(entry.id, {
							status: "error",
							error: reason instanceof Error ? reason.message : String(reason),
						});
					}
				}
			});
			await Promise.all(workers);
			setBusy(false);
			if (uploaded) {
				notify.success(t("upload.success"), `${uploaded}/${queue.length}`);
				onUploaded();
			}
		},
		[directory, onUploaded, patch, send, t],
	);

	/** Adds a picked or dropped tree to the queue, then starts it. */
	const accept = useCallback(
		(tree: DroppedTree) => {
			if (!tree.files.length) {
				notify.warning(t("upload.no_files_drag"));
				return;
			}
			const added: QueueEntry[] = tree.files.map((dropped, index) => ({
				id: `${Date.now()}-${index}-${dropped.path}`,
				file: dropped.file,
				path: dropped.path,
				status: "pending",
				sent: 0,
			}));
			const next = [...entries, ...added];
			commit(next);
			void run(added);
		},
		[commit, entries, run, t],
	);

	function retry(entry: QueueEntry) {
		const next = entries.map((item) =>
			item.id === entry.id ? { ...item, status: "pending" as const, error: undefined } : item,
		);
		commit(next);
		void run([next.find((item) => item.id === entry.id)!]);
	}

	const done = entries.filter((entry) => entry.status === "success" || entry.status === "error");
	const allDone = entries.length > 0 && done.length === entries.length;

	return (
		<Dialog
			title={t("upload.title")}
			size="lg"
			onClose={onClose}
			// §18.12: neither the backdrop nor Esc closes this one.
			closeOnBackdrop={false}
			closeOnEsc={false}
			footer={
				done.length > 0 ? (
					<div className="flex w-full items-center gap-2">
						<ActionButton
							tone="accent"
							size="sm"
							onPress={() => commit(entries.filter((entry) => entry.status !== "success" && entry.status !== "error"))}
						>
							{t("upload.clear_done")}
						</ActionButton>
						{allDone && (
							<ActionButton tone="soft" size="sm" onPress={() => commit([])}>
								{t("upload.back")}
							</ActionButton>
						)}
						<span className="ml-auto text-[11px] text-neutral-10">
							{done.length}/{entries.length}
						</span>
					</div>
				) : undefined
			}
		>
			{/* §9.1: the drop target. No files queued yet, or a new batch on top of an
			    old one, both show it. */}
			<div className="flex flex-col gap-3">
				<div
					onDragOver={(event) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(event) => {
						event.preventDefault();
						setDragging(false);
						void droppedTree(event.dataTransfer).then(accept);
					}}
					className={`flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
						dragging ? "border-main bg-main-soft" : "border-neutral-8"
					}`}
				>
					{dragging ? (
						<p className="text-lg">{t("upload.release")}</p>
					) : (
						<>
							<p className="text-sm text-neutral-11">{t("upload.upload-tips")}</p>
							<div className="flex items-center gap-3">
								<div className="flex flex-col items-center gap-1">
									<ActionButton
										tone="accent"
										icon="folder-up"
										size="lg"
										iconOnly
										aria-label={t("upload.upload_folder")}
										onPress={() => folderPicker.current?.click()}
									/>
									<span className="text-[11px] text-neutral-10">{t("upload.upload_folder")}</span>
								</div>
								<div className="flex flex-col items-center gap-1">
									<ActionButton
										tone="accent"
										icon="upload"
										size="lg"
										iconOnly
										aria-label={t("upload.upload_files")}
										onPress={() => filePicker.current?.click()}
									/>
									<span className="text-[11px] text-neutral-10">{t("upload.upload_files")}</span>
								</div>
							</div>
							<div className="flex flex-wrap items-center justify-center gap-4">
								<Checkbox
									checked={overwrite}
									onChange={(value) => {
										setOverwrite(value);
										session = { ...session, overwrite: value };
									}}
									label={t("toolbar.conflict_overwrite")}
									labelClassName="text-[13px] text-neutral-11"
								/>
								{canChunk === false && (
									<span className="text-[11px] text-neutral-10">{t("upload.uploading")} 100 MB</span>
								)}
							</div>
						</>
					)}
					<input
						ref={filePicker}
						type="file"
						multiple
						hidden
						onChange={(event) => {
							if (event.target.files?.length) accept(pickedTree(event.target.files));
							event.target.value = "";
						}}
					/>
					<input
						ref={folderPicker}
						type="file"
						hidden
						{...{ webkitdirectory: "", directory: "" }}
						onChange={(event) => {
							if (event.target.files?.length) accept(pickedTree(event.target.files));
							event.target.value = "";
						}}
					/>
				</div>

				{entries.length > 0 && (
					<div className="flex flex-col gap-1.5">
						{entries.map((entry) => (
							<QueueRow key={entry.id} entry={entry} onRetry={() => retry(entry)} />
						))}
					</div>
				)}

				{busy && (
					<p role="status" className="text-[11px] text-neutral-10">
						{t("upload.uploading")}…
					</p>
				)}
			</div>
		</Dialog>
	);
}

/** One queued file (§9.2). */
function QueueRow({ entry, onRetry }: { entry: QueueEntry; onRetry: () => void }) {
	const t = useT();
	const label =
		entry.status === "pending"
			? t("upload.pending")
			: entry.status === "uploading"
				? t("upload.uploading")
				: entry.status === "success"
					? t("upload.success")
					: t("upload.error");
	const tone =
		entry.status === "success"
			? "bg-success-3 text-success-11"
			: entry.status === "error"
				? "bg-danger-3 text-danger-11"
				: entry.status === "uploading"
					? "bg-info-3 text-info-11"
					: "bg-neutral-3 text-neutral-11";

	return (
		<div className="flex flex-col gap-1.5 rounded-lg border border-neutral-7 p-2 hover:border-main">
			<p className="text-[13px] break-all">{entry.path}</p>
			<div className="flex items-center gap-2">
				<span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
				<span className="numeric text-[11px] text-neutral-10">{formatBytes(entry.file.size)}</span>
				{entry.status === "error" && (
					<button type="button" onClick={onRetry} className="tap ml-auto text-[11px] font-medium text-accent-11">
						{t("upload.retry")}
					</button>
				)}
				{entry.status === "uploading" && entry.sent > 0 && (
					<span className="numeric ml-auto text-[11px] text-neutral-10">{percentOf(entry.sent, entry.file.size)}%</span>
				)}
			</div>
			<Progress value={entry.sent} max={entry.file.size} size="sm" label={entry.path} />
			{entry.error && <p className="text-[11px] text-danger-11">{entry.error}</p>}
		</div>
	);
}

/** A resumable upload for the sidebar's drop target; kept for the file browser. */
export function DropOverlay({ active }: { active: boolean }) {
	if (!active) return null;
	return (
		<div className="pointer-events-none fixed inset-0 z-drop flex items-center justify-center bg-main-soft">
			<div className="flex flex-col items-center gap-2 rounded-xl bg-surface px-8 py-6 shadow-lg">
				<Icon name="upload" className="size-8 text-main" />
				<p className="text-sm font-medium">Release to upload</p>
			</div>
		</div>
	);
}

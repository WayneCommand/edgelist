import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button as HeroButton } from "@heroui/react";
import { api } from "../../lib/api";
import { crossStorageHint, mountPathFor, summarizeTransfer } from "../../lib/transfer";
import type { StorageListResponse, TransferItemResult, TransferMode, TransferResult } from "../../lib/types";
import { useNotify } from "../../hooks/useNotify";
import { Modal } from "../common/Modal";
import { DirectoryTree } from "./DirectoryTree";

type TransferDialogProps = {
	mode: TransferMode;
	/** Directory the selected entries live in. */
	srcDir: string;
	/** Entry names to transfer, relative to `srcDir`. */
	names: string[];
	onClose: () => void;
	/** Called after at least one entry moved, so the listing can refresh. */
	onTransferred: () => void;
};

/**
 * Copy/move dialog: pick a destination in the tree, decide what happens to
 * colliding names, then let the worker run the batch. Per-entry results are
 * kept on screen when something fails, because a batch can partly succeed and
 * the reason (a read-only mount, a cross-storage target) matters.
 */
export function TransferDialog({ mode, srcDir, names, onClose, onTransferred }: TransferDialogProps) {
	const notify = useNotify();
	const [destination, setDestination] = useState(srcDir);
	const [overwrite, setOverwrite] = useState(false);
	const [skipExisting, setSkipExisting] = useState(false);
	const [merge, setMerge] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failures, setFailures] = useState<TransferItemResult[]>([]);
	const [mounts, setMounts] = useState<string[] | null>(null);

	const loadMounts = useCallback(async () => {
		try {
			const data = await api<StorageListResponse>("/api/admin/storage/list");
			setMounts((data.content ?? []).map((storage) => storage.mount_path));
		} catch {
			// The mount list only powers an early hint; the worker still enforces
			// the rule, so a failure here is not worth interrupting the dialog for.
			setMounts([]);
		}
	}, []);

	useEffect(() => {
		void loadMounts();
	}, [loadMounts]);

	const sourceMount = mounts ? mountPathFor(srcDir, mounts) : null;
	const destinationMount = mounts ? mountPathFor(destination, mounts) : null;
	const blocked = crossStorageHint(sourceMount, destinationMount);

	function chooseOverwrite(next: boolean) {
		setOverwrite(next);
		if (next) {
			setSkipExisting(false);
			setMerge(false);
		}
	}

	function chooseSkipExisting(next: boolean) {
		setSkipExisting(next);
		if (next) setOverwrite(false);
	}

	function chooseMerge(next: boolean) {
		setMerge(next);
		if (next) setOverwrite(false);
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (blocked) return;
		setBusy(true);
		setFailures([]);
		try {
			const result = await api<TransferResult>(`/api/fs/${mode}`, {
				method: "POST",
				body: JSON.stringify({
					src_dir: srcDir,
					dst_dir: destination,
					names,
					overwrite,
					skip_existing: skipExisting,
					merge,
				}),
			});
			const summary = summarizeTransfer(result);
			notify(summary.message, summary.error);
			const failed = result.results.filter((item) => item.status === "failed");
			setFailures(failed);
			if (result.accepted) onTransferred();
			if (!failed.length) onClose();
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Transfer failed", true);
		} finally {
			setBusy(false);
		}
	}

	const verb = mode === "copy" ? "Copy" : "Move";

	return (
		<Modal wide title={`${verb} ${names.length === 1 ? names[0] : `${names.length} items`}`} onClose={onClose}>
			<form className="space-y-4" onSubmit={submit}>
				<div>
					<p className="mb-2 text-sm text-muted">Destination</p>
					<div className="max-h-64 overflow-auto rounded-lg border border-border bg-field-background p-2">
						<DirectoryTree value={destination} onChange={setDestination} />
					</div>
					<p className="mt-2 truncate text-xs text-muted" title={destination}>
						Into: {destination}
					</p>
				</div>

				<fieldset className="space-y-2">
					<legend className="text-sm text-muted">If a name already exists</legend>
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={overwrite} onChange={() => chooseOverwrite(!overwrite)} />
						Overwrite existing
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={skipExisting}
							disabled={overwrite || merge}
							onChange={() => chooseSkipExisting(!skipExisting)}
						/>
						Skip existing
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={merge}
							disabled={overwrite || skipExisting || mode === "move"}
							onChange={() => chooseMerge(!merge)}
						/>
						Merge folders <span className="text-xs text-muted">(copy only)</span>
					</label>
					<p className="text-xs text-muted">Leaving all three unchecked refuses to touch a name that already exists.</p>
				</fieldset>

				{blocked && (
					<p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
						{blocked}
					</p>
				)}

				{failures.length > 0 && (
					<ul className="max-h-40 space-y-1 overflow-auto rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
						{failures.map((failure) => (
							<li key={failure.name}>
								<span className="font-medium">{failure.name}</span>: {failure.error ?? "failed"}
								{failure.code ? <span className="text-muted"> ({failure.code})</span> : null}
							</li>
						))}
					</ul>
				)}

				<HeroButton type="submit" fullWidth isDisabled={busy || Boolean(blocked)}>
					{busy ? "Working…" : verb}
				</HeroButton>
			</form>
		</Modal>
	);
}

import { type FormEvent, useState } from "react";
import { Button as HeroButton } from "@heroui/react";
import { useT } from "../../hooks/useLocale";
import { api } from "../../lib/api";
import { destinationHint, summarizeTransfer } from "../../lib/transfer";
import type { TransferItemResult, TransferMode, TransferResult } from "../../lib/types";
import { useNotify } from "../../hooks/useNotify";
import { Modal } from "../common/Modal";
import { DirectoryTree } from "./DirectoryTree";

type TransferDialogProps = {
	mode: TransferMode;
	/** Directory the selected entries live in. */
	srcDir: string;
	/** Entry names to transfer, relative to `srcDir`. */
	names: string[];
	/** Mount paths, or `null` while they are still being fetched. */
	mounts: string[] | null;
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
export function TransferDialog({ mode, srcDir, names, mounts, onClose, onTransferred }: TransferDialogProps) {
	const t = useT();
	const notify = useNotify();
	const [destination, setDestination] = useState(srcDir);
	const [overwrite, setOverwrite] = useState(false);
	const [skipExisting, setSkipExisting] = useState(false);
	const [merge, setMerge] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failures, setFailures] = useState<TransferItemResult[]>([]);

	// Every refusal is computed from the mount list alone, so the dialog stays
	// dumb: it asks why this destination is impossible and renders the answer.
	const blocked = destinationHint(srcDir, destination, mounts);

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
			notify(reason instanceof Error ? reason.message : t("transfer.failed"), true);
		} finally {
			setBusy(false);
		}
	}

	const verb = mode === "copy" ? t("action.copy") : t("action.move");
	// One entry is named; several are counted, because a list of twenty names is
	// not a title. The noun phrase comes from the catalogue, so the plural is the
	// language's own and not an "s" appended here.
	const target = names.length === 1 ? names[0] : t("transfer.itemsOther", { count: names.length });

	return (
		<Modal wide title={t("transfer.title", { verb, target })} onClose={onClose}>
			<form className="space-y-4" onSubmit={submit}>
				<div>
					<p className="mb-2 text-sm text-muted">{t("transfer.destination")}</p>
					{/* A picker box, so it takes the field's radius and background —
					    `bg-field` is the real token; `bg-field-background` was dropped
					    by Tailwind and left this transparent. */}
					<div className="max-h-64 overflow-auto rounded-field border border-border bg-field p-2">
						<DirectoryTree value={destination} onChange={setDestination} />
					</div>
					<p className="mt-2 truncate text-xs text-muted" title={destination}>
						{t("transfer.into", { path: destination })}
					</p>
				</div>

				<fieldset className="space-y-2">
					<legend className="text-sm text-muted">{t("transfer.conflictLegend")}</legend>
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={overwrite} onChange={() => chooseOverwrite(!overwrite)} />
						{t("transfer.overwrite")}
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={skipExisting}
							disabled={overwrite || merge}
							onChange={() => chooseSkipExisting(!skipExisting)}
						/>
						{t("transfer.skipExisting")}
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={merge}
							disabled={overwrite || skipExisting || mode === "move"}
							onChange={() => chooseMerge(!merge)}
						/>
						{t("transfer.merge")} <span className="text-xs text-muted">{t("transfer.mergeCopyOnly")}</span>
					</label>
					<p className="text-xs text-muted">{t("transfer.conflictNote")}</p>
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
								<span className="font-medium">{failure.name}</span>: {failure.error ?? t("transfer.entryFailed")}
								{failure.code ? <span className="text-muted"> ({failure.code})</span> : null}
							</li>
						))}
					</ul>
				)}

				<HeroButton type="submit" fullWidth isDisabled={busy || Boolean(blocked)}>
					{busy ? t("action.working") : verb}
				</HeroButton>
			</form>
		</Modal>
	);
}

import { useMemo, useState } from "react";
import { copyPaths, movePaths } from "../lib/api";
import type { TransferResult } from "../lib/types";
import { mountFor, parentOf } from "../lib/paths";
import { useT, useWorkspace } from "../hooks/useStore";
import { notify } from "../lib/feedback";
import { Dialog, DialogActions } from "../ui/Dialog";
import { Checkbox, StateMessage } from "../ui/Field";
import { DirectoryTree } from "./DirectoryTree";

/**
 * Copy and move (§7.3), in the destination-picker shell the spec shares with
 * extract.
 *
 * The conflict policy is three checkboxes for a copy and two for a move, and the
 * interaction between them is the fiddly part — the spec spells it out and it is
 * reproduced here rather than simplified, because each rule answers "what happens if
 * the name is taken":
 *
 * - **Overwrite** wins outright: ticking it untickes both of the others.
 * - **Skip** is disabled while overwrite or merge is on.
 * - **Merge** (copy only) is disabled while overwrite or skip is on.
 *
 * With none of them ticked the Worker refuses a name that already exists, which is the
 * safe default and is what the note under the checkboxes says.
 *
 * A destination on another mount is refused before the request: the Worker answers
 * `CROSS_STORAGE_TRANSFER`, and a dialog that let the user pick a destination
 * guaranteed to fail would be worse than one that says so while the choice is being
 * made.
 */
export function TransferDialog({
	mode,
	srcDir,
	names,
	onClose,
	onDone,
}: {
	mode: "copy" | "move";
	srcDir: string;
	names: string[];
	onClose: () => void;
	onDone: (result: TransferResult) => void;
}) {
	const t = useT();
	const { mounts } = useWorkspace();
	const [destination, setDestination] = useState(srcDir);
	const [overwrite, setOverwrite] = useState(false);
	const [skip, setSkip] = useState(false);
	const [merge, setMerge] = useState(false);
	const [pending, setPending] = useState(false);

	// The reasons a destination cannot work, in the order the Worker checks them.
	const blocker = useMemo(() => {
		if (destination === srcDir) return t("toolbar.same_folder");
		if (srcDir !== "/" && destination.startsWith(`${srcDir.replace(/\/+$/, "")}/`)) return t("toolbar.inside_itself");
		if (mounts.length) {
			const from = mountFor(srcDir, mounts);
			const to = mountFor(destination, mounts);
			if (from && to && from !== to) return t("toolbar.cross_storage");
		}
		return "";
	}, [destination, mounts, srcDir, t]);

	async function submit() {
		if (blocker) return;
		setPending(true);
		try {
			const request = {
				src_dir: srcDir,
				dst_dir: destination,
				names,
				overwrite,
				skip_existing: skip,
				merge: mode === "copy" ? merge : false,
			};
			const result = mode === "copy" ? await copyPaths(request) : await movePaths(request);
			onDone(result);
		} catch (reason) {
			notify.error(reason);
		} finally {
			setPending(false);
		}
	}

	return (
		<Dialog
			title={t("toolbar.choose_dst_folder")}
			size="xl"
			onClose={onClose}
			footer={
				<DialogActions
					onCancel={onClose}
					onConfirm={() => void submit()}
					cancelText={t("global.cancel")}
					confirmLabel={t("global.ok")}
					confirmDisabled={Boolean(blocker)}
					isPending={pending}
					extra={
						<div className="mr-auto flex flex-col gap-1.5">
							<Checkbox
								checked={overwrite}
								onChange={(value) => {
									setOverwrite(value);
									if (value) {
										setSkip(false);
										setMerge(false);
									}
								}}
								label={t("toolbar.conflict_overwrite")}
								labelClassName="text-[13px] text-neutral-11"
							/>
							<Checkbox
								checked={skip}
								disabled={overwrite || merge}
								onChange={setSkip}
								label={t("toolbar.conflict_skip")}
								labelClassName="text-[13px] text-neutral-11"
							/>
							{mode === "copy" && (
								<Checkbox
									checked={merge}
									disabled={overwrite || skip}
									onChange={setMerge}
									label={t("toolbar.conflict_merge")}
									labelClassName="text-[13px] text-neutral-11"
								/>
							)}
						</div>
					}
				/>
			}
		>
			<div className="flex flex-col gap-2">
				<p className="text-[13px] text-neutral-11">
					{names.length === 1 ? names[0] : t("home.obj.count_files", { files: names.length })} → {destination}
				</p>
				{blocker ? (
					<StateMessage icon="alert-triangle" tone="danger" title={blocker} className="py-6" />
				) : (
					<DirectoryTree value={destination} onSelect={setDestination} className="h-72" />
				)}
			</div>
		</Dialog>
	);
}

/**
 * The delete confirmation (§7.4).
 *
 * §7.4 is explicit that the body does not list the names — "Are you sure to delete the
 * selected object?" — and that the confirming button is the danger tone. The count is
 * the one thing added, because a modal that says "the selected object" while seven
 * rows are ticked is actively misleading, and the spec's own button label
 * (`Confirm`) does not change.
 */
export function DeleteDialog({
	names,
	onClose,
	onConfirm,
}: {
	names: string[];
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const t = useT();
	const [pending, setPending] = useState(false);
	return (
		<Dialog
			title={t("toolbar.delete")}
			size="sm"
			onClose={onClose}
			footer={
				<DialogActions
					onCancel={onClose}
					onConfirm={async () => {
						setPending(true);
						try {
							await onConfirm();
						} finally {
							setPending(false);
						}
					}}
					cancelText={t("global.cancel")}
					confirmLabel={t("global.confirm")}
					confirmTone="danger"
					isPending={pending}
				/>
			}
		>
			<p className="leading-relaxed text-neutral-11">
				{t("toolbar.delete-tips")}
				{names.length > 1 && (
					<span className="mt-1 block text-xs text-neutral-10">
						{t("home.obj.count_files", { files: names.length })}
					</span>
				)}
			</p>
		</Dialog>
	);
}

/**
 * Remove empty folders (§7.10).
 *
 * A two-button confirmation, like delete, but the action is a sweep of the current
 * directory rather than of a selection — which is why it takes no names.
 */
export function RemoveEmptyDialog({
	path,
	onClose,
	onConfirm,
}: {
	path: string;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const t = useT();
	const [pending, setPending] = useState(false);
	return (
		<Dialog
			title={t("toolbar.remove_empty_directory")}
			size="sm"
			onClose={onClose}
			footer={
				<DialogActions
					onCancel={onClose}
					onConfirm={async () => {
						setPending(true);
						try {
							await onConfirm();
						} finally {
							setPending(false);
						}
					}}
					cancelText={t("global.cancel")}
					confirmLabel={t("global.confirm")}
					confirmTone="danger"
					isPending={pending}
				/>
			}
		>
			<p className="leading-relaxed text-neutral-11">{t("toolbar.remove_empty_directory-tips")}</p>
			<p className="mt-1 text-xs text-neutral-10">{path === "/" ? "/" : parentOf(path) || path}</p>
		</Dialog>
	);
}

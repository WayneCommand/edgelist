import { useState } from "react";
import { parentOf } from "../lib/paths";
import { useT } from "../hooks/useStore";
import { Dialog, DialogActions } from "../ui/Dialog";

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

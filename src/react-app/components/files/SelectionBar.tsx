import { useT } from "../../hooks/useLocale";
import type { Permission, Permissions } from "../../lib/mask";
import type { Selection } from "../../hooks/useSelection";

type SelectionBarProps = {
	selection: Selection;
	permissions: Permissions;
	onRename: () => void;
	onCopy: () => void;
	onMove: () => void;
	onDelete: () => void;
	onDownload: () => void;
	onCopyLink: () => void;
};

/**
 * Action bar for the current selection, pinned to the bottom of the viewport
 * the way OpenList's centre toolbar is. It only renders while something is
 * selected, so it never competes with the toolbar above the list.
 *
 * `permissions` is shared with the context menu, so an action cannot be
 * available here and greyed out there.
 */
export function SelectionBar({
	selection,
	permissions,
	onRename,
	onCopy,
	onMove,
	onDelete,
	onDownload,
	onCopyLink,
}: SelectionBarProps) {
	const t = useT();
	if (selection.count === 0) return null;
	const single = selection.count === 1 ? selection.items[0] : null;

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
			<div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-overlay/95 px-2 py-2 shadow-lg backdrop-blur">
				<span className="max-w-48 truncate px-2 text-sm text-muted">
					{selection.count === 1 ? single?.name : t("toolbar.selectedCount", { count: selection.count })}
				</span>
				<Action label={t("action.rename")} permission={permissions.rename} onPress={onRename} />
				<Action label={t("action.copy")} permission={permissions.copy} onPress={onCopy} />
				<Action label={t("action.move")} permission={permissions.move} onPress={onMove} />
				<Action label={t("action.download")} permission={permissions.download} onPress={onDownload} />
				<Action label={t("action.copyLink")} permission={permissions.link} onPress={onCopyLink} />
				<Action label={t("action.delete")} danger permission={permissions.remove} onPress={onDelete} />
				<Action label={t("action.clear")} permission={{ allowed: true }} onPress={selection.clear} />
			</div>
		</div>
	);
}

const BASE = "tap rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40";

type ActionProps = {
	label: string;
	permission: Permission;
	danger?: boolean;
	onPress: () => void;
};

/**
 * A plain button rather than the HeroUI one: the bar needs `title` and
 * `disabled` to reach the DOM verbatim, which is what explains a greyed action.
 */
function Action({ label, permission, danger = false, onPress }: ActionProps) {
	const tone = danger ? "text-danger enabled:hover:bg-danger-soft" : "enabled:hover:bg-surface-secondary";
	return (
		<button
			type="button"
			title={permission.reason}
			disabled={!permission.allowed}
			onClick={onPress}
			className={`${BASE} ${tone}`}
		>
			{label}
		</button>
	);
}

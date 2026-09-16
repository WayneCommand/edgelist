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
 * the way OpenList's centre toolbar is. It only shows itself while something is
 * selected, so it never competes with the toolbar above the list — the wording
 * is deliberate, since it stays mounted and is faded out rather than removed.
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
	const open = selection.count > 0;
	const single = selection.count === 1 ? selection.items[0] : null;

	return (
		// Always mounted, and hidden rather than absent. A bar that is
		// conditionally rendered has no frame to animate from, so it could only
		// ever cut in — and picking the first file is the moment worth showing,
		// since it is the one that turns the list into something actionable.
		<div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
			{/* Same surface as the context menu — a 24px panel with a 4px inset and a
			    shadow for the edge — because the two carry the same actions and a
			    button that changes shape between them reads as a different button.
			    The translucency and blur stay: this one floats over a scrolling list
			    rather than over the page.

			    Leaving is quicker than arriving (150ms against 300ms): an exit only
			    acknowledges the user's own action, while an entrance is news. The
			    duration sits on the state being moved to, which is the one that
			    governs the transition. */}
			<div
				data-open={open}
				// Faded out is not the same as gone, and this is load-bearing rather
				// than a courtesy: the panel keeps `pointer-events-auto` so it can be
				// clicked when it is up, and its buttons stay in the document, so
				// without this it would swallow clicks on the last row of the list and
				// be reachable by Tab while nothing is selected.
				inert={!open}
				className={`pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-3xl bg-overlay/95 p-1 shadow-overlay backdrop-blur transition-[opacity,translate] ease-out motion-reduce:transition-none ${
					open ? "translate-y-0 opacity-100 duration-300" : "translate-y-3 opacity-0 duration-150"
				}`}
			>
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

/**
 * The same geometry as a HeroUI menu item — 36px tall, 16px corners — so an
 * action is the same shape here and in the context menu. The height is what
 * keeps the 16px radius reading as a corner rather than collapsing into a pill.
 */
const BASE =
	"tap flex min-h-9 items-center rounded-2xl px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40";

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

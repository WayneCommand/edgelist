import { groupByParent } from "../../lib/batch";
import type { Selection } from "../../hooks/useSelection";

type SelectionBarProps = {
	selection: Selection;
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
 * Actions that need exactly one target stay enabled only for a single entry
 * rather than silently acting on the first of many.
 */
export function SelectionBar({
	selection,
	onRename,
	onCopy,
	onMove,
	onDelete,
	onDownload,
	onCopyLink,
}: SelectionBarProps) {
	if (selection.count === 0) return null;
	const single = selection.count === 1 ? selection.items[0] : null;
	// Archives are not implemented, so a selection holding a directory cannot be
	// fetched in one go. Refusing is clearer than downloading nothing.
	const hasDirectory = selection.items.some((item) => item.is_dir);
	// A transfer names one source directory, so a selection spanning several
	// directories — which is what a search produces — has to be narrowed first.
	const spansDirectories = groupByParent(selection.items).size > 1;

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
			<div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-overlay/95 px-2 py-2 shadow-lg backdrop-blur">
				<span className="max-w-48 truncate px-2 text-sm text-muted">
					{selection.count === 1 ? single?.name : `${selection.count} selected`}
				</span>
				<Action
					label="Rename"
					disabled={!single}
					title={single ? undefined : "Rename works on one entry at a time"}
					onPress={onRename}
				/>
				<Action
					label="Copy"
					disabled={spansDirectories}
					title={spansDirectories ? "Copy needs entries from a single folder" : undefined}
					onPress={onCopy}
				/>
				<Action
					label="Move"
					disabled={spansDirectories}
					title={spansDirectories ? "Move needs entries from a single folder" : undefined}
					onPress={onMove}
				/>
				<Action
					label="Download"
					disabled={hasDirectory}
					title={hasDirectory ? "Archives are not supported yet" : undefined}
					onPress={onDownload}
				/>
				<Action
					label="Copy link"
					disabled={!single || single.is_dir}
					title={single?.is_dir ? "Folders have no link" : undefined}
					onPress={onCopyLink}
				/>
				<Action label="Delete" danger onPress={onDelete} />
				<Action label="Clear" onPress={selection.clear} />
			</div>
		</div>
	);
}

const BASE =
	"rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

type ActionProps = {
	label: string;
	title?: string;
	danger?: boolean;
	disabled?: boolean;
	onPress: () => void;
};

/**
 * A plain button rather than the HeroUI one: the bar needs `title` and
 * `disabled` to reach the DOM verbatim, which is what explains a greyed action.
 */
function Action({ label, title, danger = false, disabled = false, onPress }: ActionProps) {
	const tone = danger ? "text-danger enabled:hover:bg-danger-soft" : "enabled:hover:bg-surface-secondary";
	return (
		<button type="button" title={title} disabled={disabled} onClick={onPress} className={`${BASE} ${tone}`}>
			{label}
		</button>
	);
}

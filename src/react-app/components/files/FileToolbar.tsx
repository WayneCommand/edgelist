import { type ChangeEvent, useRef } from "react";
import { Button as HeroButton } from "@heroui/react";
import type { Selection } from "../../hooks/useSelection";
import { useT } from "../../hooks/useLocale";
import { pickedTree, type DroppedTree } from "../../lib/dropUpload";
import type { MessageKey } from "../../lib/i18n";
import type { ViewMode } from "../../lib/preferences";
import { progressPercent, type UploadProgress } from "../../lib/upload";
import { FolderPlusIcon, FolderUpIcon, RefreshIcon, UploadIcon } from "../common/icons";
import { SegmentedControl } from "../common/SegmentedControl";

type FileToolbarProps = {
	selection: Selection;
	view: ViewMode;
	/** Set while a batch is in flight, so the buttons can lock and show progress. */
	uploading: UploadProgress | null;
	/**
	 * Why nothing can be written to the current directory, or `null` when it can.
	 * Three actions here create entries — the two pickers and New folder — and all
	 * three would fail identically, so they are locked together with one reason.
	 */
	writeHint: string | null;
	/**
	 * The per-file ceiling, for a directory whose storage cannot split an upload,
	 * or `null` where the note would not apply. It is a capability note rather
	 * than an error: nothing is wrong until a file is picked that is too big.
	 */
	ceilingHint: string | null;
	onViewChange: (view: ViewMode) => void;
	onRefresh: () => void;
	onNewFolder: () => void;
	onUpload: (tree: DroppedTree) => void;
};

// `webkitdirectory` is how a browser offers a folder picker. React's JSX types do
// not know the attribute, and the index signature keeps the spread honest.
const DIRECTORY_PICKER: Record<string, string> = { webkitdirectory: "", directory: "" };

export function FileToolbar({
	selection,
	view,
	uploading,
	writeHint,
	ceilingHint,
	onViewChange,
	onRefresh,
	onNewFolder,
	onUpload,
}: FileToolbarProps) {
	const t = useT();
	const fileRef = useRef<HTMLInputElement>(null);
	const folderRef = useRef<HTMLInputElement>(null);
	const busy = uploading !== null;
	// A locked toolbar hides the pickers' triggers but not the inputs themselves,
	// so `pick` guards as well — a stray click through a hidden label would
	// otherwise still open a picker for a directory that cannot take a file.
	const locked = busy || writeHint !== null;

	// Both pickers differ only in what the browser lets the user choose, so the
	// change handling is shared. Clearing `value` is what lets the same file be
	// picked twice in a row — otherwise `change` never fires again.
	function pick(event: ChangeEvent<HTMLInputElement>) {
		const files = event.target.files;
		if (files?.length && !locked) onUpload(pickedTree(files));
		event.target.value = "";
	}

	return (
		<div className="mb-3 flex flex-wrap items-center gap-3">
			<label className="flex items-center gap-2 text-sm text-muted">
				<input
					type="checkbox"
					className="h-4 w-4"
					checked={selection.allSelected}
					readOnly
					aria-label={t("toolbar.selectAll")}
					ref={(node) => {
						if (node) node.indeterminate = selection.someSelected;
					}}
					onClick={selection.toggleAll}
				/>
				{selection.count > 0 ? t("toolbar.selectedCount", { count: selection.count }) : t("toolbar.selectAll")}
			</label>
			<div className="ml-auto flex flex-wrap items-center gap-2">
				{uploading && (
					<span role="status" className="text-xs text-muted">
						{/* A file going up in parts reports its own progress: the file
						    counter alone would sit still for minutes. */}
						{t("toolbar.uploading", { done: uploading.done, total: uploading.total })}
						{uploading.bytes ? ` · ${progressPercent(uploading.bytes.sent, uploading.bytes.total)}%` : ""}…
					</span>
				)}
				{writeHint && (
					// A disabled button swallows the hover that would show its `title`,
					// so the reason is written out where it can actually be read.
					<span className="text-xs text-muted" data-testid="write-hint">
						{writeHint}
					</span>
				)}
				{ceilingHint && (
					<span className="text-xs text-muted" data-testid="ceiling-hint">
						{ceilingHint}
					</span>
				)}
				<ViewSwitch view={view} onChange={onViewChange} />
				<HeroButton size="sm" variant="outline" isDisabled={locked} onPress={onNewFolder}>
					<FolderPlusIcon />
					{t("files.newFolder")}
				</HeroButton>
				<HeroButton size="sm" variant="outline" isDisabled={locked} onPress={() => folderRef.current?.click()}>
					<FolderUpIcon />
					{t("toolbar.uploadFolder")}
				</HeroButton>
				<HeroButton size="sm" variant="secondary" isDisabled={locked} onPress={() => fileRef.current?.click()}>
					<UploadIcon />
					{t("toolbar.upload")}
				</HeroButton>
				<HeroButton size="sm" variant="ghost" onPress={onRefresh}>
					<RefreshIcon />
					{t("action.refresh")}
				</HeroButton>
			</div>
			<input ref={fileRef} hidden type="file" multiple onChange={pick} />
			<input ref={folderRef} hidden type="file" multiple {...DIRECTORY_PICKER} onChange={pick} />
		</div>
	);
}

const VIEW_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: MessageKey }> = [
	{ mode: "list", label: "toolbar.listView" },
	{ mode: "grid", label: "toolbar.gridView" },
];

function ViewSwitch({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
	const t = useT();
	return (
		<SegmentedControl
			ariaLabel={t("toolbar.viewMode")}
			value={view}
			onChange={onChange}
			options={VIEW_OPTIONS.map((option) => ({ value: option.mode, label: t(option.label) }))}
		/>
	);
}

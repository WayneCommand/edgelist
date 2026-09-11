import { useRef } from "react";
import { Button as HeroButton } from "@heroui/react";
import type { Selection } from "../../hooks/useSelection";
import type { ViewMode } from "../../lib/preferences";

type FileToolbarProps = {
	selection: Selection;
	view: ViewMode;
	onViewChange: (view: ViewMode) => void;
	onRefresh: () => void;
	onNewFolder: () => void;
	onUpload: (files: FileList) => void;
};

export function FileToolbar({ selection, view, onViewChange, onRefresh, onNewFolder, onUpload }: FileToolbarProps) {
	const uploadRef = useRef<HTMLInputElement>(null);

	return (
		<div className="mb-3 flex flex-wrap items-center gap-3">
			<label className="flex items-center gap-2 text-sm text-muted">
				<input
					type="checkbox"
					className="h-4 w-4"
					checked={selection.allSelected}
					readOnly
					aria-label="Select all files"
					ref={(node) => {
						if (node) node.indeterminate = selection.someSelected;
					}}
					onClick={selection.toggleAll}
				/>
				{selection.count > 0 ? `${selection.count} selected` : "Select all"}
			</label>
			<div className="ml-auto flex flex-wrap items-center gap-2">
				<ViewSwitch view={view} onChange={onViewChange} />
				<HeroButton size="sm" variant="outline" onPress={onNewFolder}>
					New folder
				</HeroButton>
				<HeroButton size="sm" variant="secondary" onPress={() => uploadRef.current?.click()}>
					Upload
				</HeroButton>
				<HeroButton size="sm" variant="ghost" onPress={onRefresh}>
					Refresh
				</HeroButton>
			</div>
			<input
				ref={uploadRef}
				hidden
				type="file"
				multiple
				onChange={(event) => {
					const files = event.target.files;
					if (files?.length) onUpload(files);
					event.target.value = "";
				}}
			/>
		</div>
	);
}

const VIEW_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
	{ mode: "list", label: "List" },
	{ mode: "grid", label: "Grid" },
];

function ViewSwitch({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
	return (
		<div
			role="group"
			aria-label="View mode"
			className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
		>
			{VIEW_OPTIONS.map((option) => (
				<button
					key={option.mode}
					type="button"
					aria-pressed={view === option.mode}
					onClick={() => onChange(option.mode)}
					className={`rounded-md px-2 py-1 text-xs transition-colors ${
						view === option.mode ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
					}`}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

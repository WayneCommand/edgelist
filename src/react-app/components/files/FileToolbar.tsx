import { useRef } from "react";
import { Button as HeroButton } from "@heroui/react";
import type { Selection } from "../../hooks/useSelection";

type FileToolbarProps = {
	selection: Selection;
	onRefresh: () => void;
	onNewFolder: () => void;
	onUpload: (files: FileList) => void;
};

export function FileToolbar({ selection, onRefresh, onNewFolder, onUpload }: FileToolbarProps) {
	const uploadRef = useRef<HTMLInputElement>(null);

	return (
		<div className="mb-3 flex flex-wrap items-center gap-3">
			<label className="flex items-center gap-2 text-sm text-muted">
				<input
					type="checkbox"
					className="h-4 w-4 accent-[var(--accent)]"
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
			<div className="ml-auto flex flex-wrap gap-2">
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

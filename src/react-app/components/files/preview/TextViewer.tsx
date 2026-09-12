import type { ReactNode } from "react";
import { Button as HeroButton } from "@heroui/react";
import { languageForFile } from "../../../lib/format";
import { previewCaption } from "../../../lib/preview";
import type { FileItem } from "../../../lib/types";
import { MonacoTextEditor } from "../../common/MonacoTextEditor";

export type TextViewerProps = {
	item: FileItem;
	text: string;
	dirty: boolean;
	saving: boolean;
	onChange: (text: string) => void;
	onSave: () => void;
	/**
	 * Extra controls for the row above the editor. The Markdown viewer puts its
	 * Rendered/Source switch here, so that switching to Source does not leave two
	 * toolbars — and two Save buttons — stacked on top of each other.
	 */
	leading?: ReactNode;
};

/** The editor and its Save button. Reached lazily — see `lazyTextViewer.ts`. */
export function TextViewer({ item, text, dirty, saving, onChange, onSave, leading }: TextViewerProps) {
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-xs text-muted">{previewCaption("text", item.name, item.size)}</p>
				<div className="flex items-center gap-2">
					{leading}
					<HeroButton size="sm" isDisabled={!dirty || saving} onPress={onSave}>
						{saving ? "Saving…" : "Save"}
					</HeroButton>
				</div>
			</div>
			<MonacoTextEditor
				key={item.path}
				value={text}
				language={languageForFile(item.name) ?? "plaintext"}
				path={item.path}
				onChange={onChange}
			/>
		</div>
	);
}

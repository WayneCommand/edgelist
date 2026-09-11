import { Button as HeroButton } from "@heroui/react";
import { languageForFile } from "../../lib/format";
import type { FileItem } from "../../lib/types";
import { MonacoTextEditor } from "../common/MonacoTextEditor";
import { Modal } from "../common/Modal";

type FilePreviewModalProps = {
	item: FileItem;
	content: string;
	dirty: boolean;
	saving: boolean;
	onChange: (content: string) => void;
	onSave: () => void;
	onClose: () => void;
};

export function FilePreviewModal({ item, content, dirty, saving, onChange, onSave, onClose }: FilePreviewModalProps) {
	const language = languageForFile(item.name);
	return (
		<Modal wide title={`${item.name}${dirty ? " *" : ""}`} onClose={onClose}>
			<div className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<p className="text-xs text-muted">{language?.toUpperCase()} · 在线编辑</p>
					<HeroButton size="sm" isDisabled={!dirty || saving} onPress={onSave}>
						{saving ? "Saving…" : "Save"}
					</HeroButton>
				</div>
				<MonacoTextEditor
					key={item.path}
					value={content}
					language={language ?? "plaintext"}
					path={item.path}
					onChange={onChange}
				/>
			</div>
		</Modal>
	);
}

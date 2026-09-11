import { useState } from "react";
import { Button as HeroButton } from "@heroui/react";
import { storageFromJson, storageToJson } from "../../lib/drivers";
import type { Storage } from "../../lib/types";
import { Modal } from "../common/Modal";

type StorageJsonDialogProps = {
	mode: "import" | "export";
	storage: Storage;
	onImport: (storage: Storage) => void;
	onClose: () => void;
};

const AREA_CLASS =
	"h-64 w-full rounded-lg border border-border bg-field-background p-3 font-mono text-xs text-foreground outline-none transition focus:border-focus focus:ring-4 focus:ring-accent/15";

/**
 * Moving a storage in and out as JSON, the way OpenList does it: the whole
 * record travels, so a mount can be copied between instances. Import drops the
 * server-owned fields; export includes credentials, which the dialog says out
 * loud rather than leaving the user to discover it.
 */
export function StorageJsonDialog({ mode, storage, onImport, onClose }: StorageJsonDialogProps) {
	const [text, setText] = useState(() => (mode === "export" ? storageToJson(storage) : ""));
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
		} catch {
			// Clipboard access can be denied; the text is selectable anyway.
			setError("Copying failed — select the text and copy it manually");
		}
	}

	function submit() {
		try {
			onImport(storageFromJson(text));
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Unable to read that storage");
		}
	}

	return (
		<Modal wide title={mode === "export" ? "Export storage" : "Import storage"} onClose={onClose}>
			<div className="space-y-3">
				{!copied && mode === "export" && (
					<p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
						This JSON contains the storage credentials.
					</p>
				)}
				{!copied && mode === "import" && (
					<p className="text-xs text-muted">
						Paste a storage exported from EdgeList or OpenList. `id`, `status`, `disabled` and `modified` are ignored.
					</p>
				)}
				<textarea
					className={AREA_CLASS}
					value={text}
					aria-label="Storage JSON"
					readOnly={mode === "export"}
					placeholder={mode === "import" ? '{ "mount_path": "/nas", "driver": "webdav", ... }' : undefined}
					onChange={(event) => {
						setText(event.target.value);
						setError("");
					}}
				/>
				{error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}
				{copied && <p className="text-sm text-success">Copied to the clipboard</p>}
				{mode === "export" ? (
					<HeroButton fullWidth onPress={() => void copy()}>
						Copy JSON
					</HeroButton>
				) : (
					<HeroButton fullWidth isDisabled={!text.trim()} onPress={submit}>
						Import
					</HeroButton>
				)}
			</div>
		</Modal>
	);
}

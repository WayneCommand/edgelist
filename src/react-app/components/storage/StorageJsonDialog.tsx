import { useState } from "react";
import { Button as HeroButton } from "@heroui/react";
import { storageFromJson, storageToJson } from "../../lib/drivers";
import type { Storage } from "../../lib/types";
import { useT } from "../../hooks/useLocale";
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
	const t = useT();
	const [text, setText] = useState(() => (mode === "export" ? storageToJson(storage) : ""));
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
		} catch {
			// Clipboard access can be denied; the text is selectable anyway.
			setError(t("storages.copyFailed"));
		}
	}

	function submit() {
		try {
			onImport(storageFromJson(text));
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : t("storages.importFailed"));
		}
	}

	return (
		<Modal
			wide
			title={mode === "export" ? t("storages.jsonExportTitle") : t("storages.jsonImportTitle")}
			onClose={onClose}
		>
			<div className="space-y-3">
				{!copied && mode === "export" && (
					<p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
						{t("storages.jsonCredentials")}
					</p>
				)}
				{!copied && mode === "import" && <p className="text-xs text-muted">{t("storages.jsonImportHint")}</p>}
				<textarea
					className={AREA_CLASS}
					value={text}
					aria-label={t("storages.jsonLabel")}
					readOnly={mode === "export"}
					placeholder={mode === "import" ? '{ "mount_path": "/nas", "driver": "webdav", ... }' : undefined}
					onChange={(event) => {
						setText(event.target.value);
						setError("");
					}}
				/>
				{error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}
				{copied && <p className="text-sm text-success">{t("storages.copied")}</p>}
				{mode === "export" ? (
					<HeroButton fullWidth onPress={() => void copy()}>
						{t("storages.copyJson")}
					</HeroButton>
				) : (
					<HeroButton fullWidth isDisabled={!text.trim()} onPress={submit}>
						{t("storages.import")}
					</HeroButton>
				)}
			</div>
		</Modal>
	);
}

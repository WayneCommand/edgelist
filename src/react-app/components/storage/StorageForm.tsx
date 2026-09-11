import type { FormEvent } from "react";
import { Button as HeroButton } from "@heroui/react";
import type { DriverInfo } from "../../lib/drivers";
import type { Storage } from "../../lib/types";
import { Modal } from "../common/Modal";
import { StorageFields } from "./StorageFields";

type StorageFormProps = {
	drivers: DriverInfo[];
	draft: Storage;
	onChange: (storage: Storage) => void;
	onSave: (event: FormEvent<HTMLFormElement>) => void;
	onClose: () => void;
	onOpenJson: (mode: "import" | "export") => void;
	error: string;
};

/** The storage dialog: a frame around `StorageFields` plus the save action. */
export function StorageForm({ drivers, draft, onChange, onSave, onClose, onOpenJson, error }: StorageFormProps) {
	return (
		<Modal wide title={draft.id ? "Edit storage" : "Add storage"} onClose={onClose}>
			<form className="max-h-[78vh] space-y-6 overflow-y-auto pr-1" onSubmit={onSave}>
				<StorageFields drivers={drivers} draft={draft} onChange={onChange} onOpenJson={onOpenJson} />
				{error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}
				<HeroButton type="submit" fullWidth>
					Save storage
				</HeroButton>
			</form>
		</Modal>
	);
}

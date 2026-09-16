import { Button as HeroButton } from "@heroui/react";
import {
	additionOf,
	driverFor,
	itemValue,
	setField,
	withDriver,
	type DriverInfo,
	type DriverScope,
} from "../../lib/drivers";
import type { Storage } from "../../lib/types";
import { useConfirm } from "../../hooks/useConfirm";
import { useT } from "../../hooks/useLocale";
import { DriverField } from "./DriverField";

type StorageFieldsProps = {
	/** Driver definitions from `/api/admin/driver/list`; empty while loading. */
	drivers: DriverInfo[];
	draft: Storage;
	onChange: (storage: Storage) => void;
	onOpenJson: (mode: "import" | "export") => void;
};

/**
 * The body of a storage form, kept apart from the dialog that frames it so the
 * fields can be rendered on their own.
 *
 * Everything here is driven by the driver registry: the fields, their types,
 * defaults, choices and required flags all arrive from the worker, so the only
 * thing this component decides is which driver the select offers.
 */
export function StorageFields({ drivers, draft, onChange, onOpenJson }: StorageFieldsProps) {
	const confirm = useConfirm();
	const t = useT();
	const info = driverFor(drivers, draft.driver);

	if (!info) return <p className="py-6 text-center text-sm text-muted">{t("storages.loadingDrivers")}</p>;

	const addition = additionOf(draft);
	// Common items live on the storage record itself, so they read from `draft`.
	const record = draft as unknown as Record<string, unknown>;

	async function changeDriver(next: string) {
		const target = driverFor(drivers, next);
		// Switching replaces the driver-specific half. On a storage that already
		// has one, that silently discards credentials, so ask first.
		if (draft.id > 0 && Object.keys(addition).length > 0) {
			const ok = await confirm({
				title: t("storages.switchDriverTitle"),
				message: t("storages.switchDriverMessage", { driver: target?.name ?? next }),
				confirmLabel: t("storages.switchDriver"),
				danger: true,
			});
			if (!ok) return;
		}
		onChange(withDriver(draft, next, target));
	}

	function field(scope: DriverScope, name: string, value: unknown) {
		onChange(setField(draft, scope, name, value));
	}

	return (
		<>
			<section>
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-base font-semibold">{t("storages.general")}</h3>
					<div className="flex gap-2">
						<HeroButton size="sm" variant="ghost" onPress={() => onOpenJson("export")}>
							{t("storages.exportJson")}
						</HeroButton>
						<HeroButton size="sm" variant="ghost" onPress={() => onOpenJson("import")}>
							{t("storages.importJson")}
						</HeroButton>
					</div>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block text-sm">
						<span className="mb-1.5 block font-medium text-foreground">{t("storages.driverLabel")}</span>
						<select
							value={draft.driver}
							aria-label={t("storages.driverLabel")}
							className="w-full px-3 py-2 text-sm"
							onChange={(event) => void changeDriver(event.target.value)}
						>
							{drivers.map((driver) => (
								<option key={driver.key} value={driver.key}>
									{driver.name}
								</option>
							))}
						</select>
					</label>
					{info.common.map((item) => (
						<DriverField
							key={item.name}
							item={item}
							value={itemValue(record, item)}
							onChange={(value) => field("common", item.name, value)}
						/>
					))}
				</div>
			</section>
			<section>
				<h3 className="mb-3 text-base font-semibold">{t("storages.driverSettings", { driver: info.name })}</h3>
				<div className="grid gap-3 sm:grid-cols-2">
					{info.additional.map((item) => (
						<div key={item.name} className={item.type === "text" ? "sm:col-span-2" : undefined}>
							<DriverField
								item={item}
								value={itemValue(addition, item)}
								onChange={(value) => field("additional", item.name, value)}
							/>
						</div>
					))}
				</div>
			</section>
		</>
	);
}

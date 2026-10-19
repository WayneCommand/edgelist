import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { deleteStorage, listStorages, reloadStorages, setStorageEnabled } from "../lib/api";
import type { StorageConfig } from "../lib/types";
import { formatBytes } from "../lib/format";
import { confirm, notify } from "../lib/feedback";
import { driverLabel, loadWorkspace, useT, useWorkspace } from "../hooks/useStore";
import { ROUTES } from "../routes";
import { ActionButton } from "../ui/ActionButton";
import { CapacityBar, Checkbox, Chip, Loading, StateMessage } from "../ui/Field";
import { ManageHeading } from "./ManageShell";

/**
 * Storages (§12.9).
 *
 * Two layouts and a filter, with the layout remembered in `localStorage` — which is what
 * the spec asks for and what makes the table view a preference rather than a per-visit
 * choice.
 *
 * The card is the default and is the one worth reading: it shows the mount path, the
 * driver badge, a capacity bar when the driver reports disk space, the status *word*
 * rather than a colour alone, the remark, and the three actions. §12.9's status mapping
 * is honoured (`work` → "Working", `disabled` → "Disabled", anything else verbatim) rather
 * than collapsed to a boolean, because the Worker can report a third state and inventing
 * a label for it would hide it.
 */
export function StorageListPage() {
	const t = useT();
	const navigate = useNavigate();
	const { storages, drivers, loaded } = useWorkspace();
	const [rows, setRows] = useState<StorageConfig[]>(storages);
	const [loading, setLoading] = useState(!loaded);
	const [table, setTable] = useState(() => readFlag("storages-layout") === "table");
	const [filter, setFilter] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const page = await listStorages();
			setRows(page.content ?? []);
			// The workspace's mount list is what the browser uses to decide writability,
			// so it is refreshed here rather than left to the next page load.
			await loadWorkspace(true);
		} catch (reason) {
			notify.error(reason);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const shown = filter.size ? rows.filter((row) => filter.has(String(row.driver).toLowerCase())) : rows;

	async function toggle(row: StorageConfig) {
		setBusy(`toggle-${row.id}`);
		try {
			await setStorageEnabled(row.id, row.disabled);
			await refresh();
		} catch (reason) {
			notify.error(reason);
		} finally {
			setBusy(null);
		}
	}

	async function remove(row: StorageConfig) {
		const ok = await confirm({
			title: t("global.delete"),
			message: t("global.delete_confirm", { name: row.mount_path }),
			confirmLabel: t("global.confirm"),
			danger: true,
		});
		if (!ok) return;
		setBusy(`delete-${row.id}`);
		try {
			await deleteStorage(row.id);
			notify.success(t("storages.deleted"));
			await refresh();
		} catch (reason) {
			notify.error(reason);
		} finally {
			setBusy(null);
		}
	}

	async function reloadAll() {
		setBusy("reload");
		try {
			await reloadStorages();
			notify.success(t("storages.reloaded"));
			await refresh();
		} catch (reason) {
			notify.error(reason);
		} finally {
			setBusy(null);
		}
	}

	return (
		<div>
			<ManageHeading title={t("storages.title")}>
				{/* Refresh was the spec's violet accent, which read as a third colour
				    next to a blue interface. macOS has one tint for actions and uses
				    weight, not hue, to rank them — so both buttons are neutral and the
				    primary one is the only one with a fill. */}
				<ActionButton
					tone="soft"
					icon="refresh"
					size="sm"
					isPending={busy === "reload"}
					onPress={() => void reloadAll()}
				>
					{t("global.refresh")}
				</ActionButton>
				<ActionButton tone="primary" icon="plus" size="sm" onPress={() => navigate(ROUTES.storageAdd)}>
					{t("storages.add")}
				</ActionButton>
				{drivers.length > 0 && (
					<div className="flex items-center gap-1">
						{drivers.map((driver) => (
							<button
								key={driver.key}
								type="button"
								aria-pressed={filter.has(driver.key)}
								onClick={() => {
									const next = new Set(filter);
									if (next.has(driver.key)) next.delete(driver.key);
									else next.add(driver.key);
									setFilter(next);
								}}
								className={`tap rounded-md px-2 py-1 text-[11px] font-medium ${
									filter.has(driver.key) ? "bg-info-10 text-white" : "bg-neutral-3 text-neutral-11 hover:bg-neutral-4"
								}`}
							>
								{driver.name}
							</button>
						))}
					</div>
				)}
				<Checkbox
					checked={table}
					onChange={(value) => {
						setTable(value);
						writeFlag("storages-layout", value ? "table" : "grid");
					}}
					label={t("storages.table_layout")}
					labelClassName="text-[13px] text-neutral-11"
				/>
			</ManageHeading>

			{loading ? (
				<div className="flex justify-center py-16">
					<Loading size="lg" />
				</div>
			) : shown.length === 0 ? (
				<StateMessage
					icon="database"
					title={t("storages.empty")}
					description={t("storages.empty_hint")}
					action={
						<ActionButton tone="soft" icon="plus" onPress={() => navigate(ROUTES.storageAdd)}>
							{t("storages.add")}
						</ActionButton>
					}
				/>
			) : table ? (
				<div className="overflow-x-auto rounded-xl bg-surface shadow-md">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-hairline text-left text-xs font-semibold text-neutral-11">
								<th className="px-3 py-2">{t("storages.mount_path")}</th>
								<th className="px-3 py-2">{t("storages.driver")}</th>
								<th className="px-3 py-2">{t("storages.order")}</th>
								<th className="px-3 py-2">{t("storages.usage")}</th>
								<th className="px-3 py-2">{t("storages.status")}</th>
								<th className="px-3 py-2">{t("storages.remark")}</th>
								<th className="px-3 py-2 text-right">{t("global.operations")}</th>
							</tr>
						</thead>
						<tbody>
							{shown.map((row) => (
								<tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-row-hover">
									<td className="px-3 py-2 font-medium break-all">{row.mount_path}</td>
									<td className="px-3 py-2">
										<Chip tone="info">{driverLabel(drivers, row.driver)}</Chip>
									</td>
									<td className="numeric px-3 py-2 text-neutral-11">{row.order ?? 0}</td>
									<td className="px-3 py-2">{capacityOf(row)}</td>
									<td className="px-3 py-2">{statusOf(row, t)}</td>
									<td className="max-w-48 truncate px-3 py-2 text-neutral-11">{row.remark}</td>
									<td className="px-3 py-2">
										<div className="flex items-center justify-end gap-1">
											<RowActions
												row={row}
												busy={busy}
												onToggle={() => void toggle(row)}
												onDelete={() => void remove(row)}
											/>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(324px, 1fr))" }}>
					{shown.map((row) => (
						<div
							key={row.id}
							className="flex flex-col gap-2 rounded-lg border border-neutral-7 bg-neutral-2 p-3 hover:border-main"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm font-medium break-all">{row.mount_path}</span>
								<Chip tone="info">{driverLabel(drivers, row.driver)}</Chip>
								{capacityBadge(row)}
							</div>
							<p className="text-xs text-neutral-11">
								{t("storages.status")}: {statusOf(row, t)}
							</p>
							{row.remark && <p className="text-xs break-words text-neutral-10">{row.remark}</p>}
							<div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
								<RowActions row={row} busy={busy} onToggle={() => void toggle(row)} onDelete={() => void remove(row)} />
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function RowActions({
	row,
	busy,
	onToggle,
	onDelete,
}: {
	row: StorageConfig;
	busy: string | null;
	onToggle: () => void;
	onDelete: () => void;
}) {
	const t = useT();
	const navigate = useNavigate();
	return (
		<>
			<ActionButton tone="soft" size="sm" onPress={() => navigate(ROUTES.storageEdit(row.id))}>
				{t("global.edit")}
			</ActionButton>
			<ActionButton
				tone={row.disabled ? "soft" : "outline"}
				size="sm"
				isPending={busy === `toggle-${row.id}`}
				onPress={onToggle}
			>
				{row.disabled ? t("global.enable") : t("global.disable")}
			</ActionButton>
			<ActionButton
				tone="ghost"
				size="sm"
				icon="trash"
				iconOnly
				aria-label={t("global.delete")}
				isPending={busy === `delete-${row.id}`}
				onPress={onDelete}
				className="text-danger-11"
			/>
		</>
	);
}

/**
 * §12.9's status mapping, kept as a mapping.
 *
 * A third value the Worker might report is printed as itself rather than folded into
 * "Working" or "Disabled": the interface does not know what it means, and inventing a
 * label would be worse than showing the server's word.
 */
function statusOf(row: StorageConfig, t: ReturnType<typeof useT>) {
	if (row.disabled || row.status === "disabled") return t("storages.status.disabled");
	if (!row.status || row.status === "work") return t("storages.status.work");
	return row.status;
}

/** Disk space, when the driver reported it — otherwise nothing at all. */
function capacityBadge(row: StorageConfig) {
	const total = typeof row.total_space === "number" ? row.total_space : 0;
	const used = typeof row.used_space === "number" ? row.used_space : 0;
	if (total <= 0) return null;
	const almostFull = (total - used) / total < 0.1;
	return (
		<Chip tone={almostFull ? "danger" : "success"}>
			{formatBytes(used)} / {formatBytes(total)}
		</Chip>
	);
}

function capacityOf(row: StorageConfig) {
	const total = typeof row.total_space === "number" ? row.total_space : 0;
	const used = typeof row.used_space === "number" ? row.used_space : 0;
	if (total <= 0) return <span className="text-neutral-9">-</span>;
	return (
		<div className="flex w-32 flex-col gap-1">
			<CapacityBar used={used} total={total} label={`${formatBytes(used)} / ${formatBytes(total)}`} />
			<span className="numeric text-[11px] text-neutral-11">
				{formatBytes(used)} / {formatBytes(total)}
			</span>
		</div>
	);
}

function readFlag(key: string): string | null {
	try {
		return globalThis.localStorage?.getItem(`edgelist:${key}`) ?? null;
	} catch {
		return null;
	}
}

function writeFlag(key: string, value: string) {
	try {
		globalThis.localStorage?.setItem(`edgelist:${key}`, value);
	} catch {
		// A preference is never worth breaking a page over.
	}
}

import { Skeleton } from "@heroui/react";
import { driverLabel, type DriverInfo } from "../../lib/drivers";
import type { Storage } from "../../lib/types";
import { useT } from "../../hooks/useLocale";

type StorageTableProps = {
	items: Storage[];
	drivers: DriverInfo[];
	/** Id of the storage an action is currently running against. */
	busyId: number | null;
	onOpen: (item: Storage) => void;
	onEdit: (item: Storage) => void;
	onToggle: (item: Storage) => void;
	onDelete: (item: Storage) => void;
};

const ACTION_CLASS =
	"rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-secondary hover:text-foreground disabled:opacity-50";

/**
 * The disk-manager view of the mounts: what is mounted where, which driver
 * serves it, and whether it is live. Rows are read-only apart from the actions,
 * because a mount's identity (`mount_path`) is what the file paths resolve
 * against — renaming it in place would silently move every path beneath it.
 */
export function StorageTable({ items, drivers, busyId, onOpen, onEdit, onToggle, onDelete }: StorageTableProps) {
	const t = useT();
	return (
		<div role="table">
			<div
				role="row"
				className="flex items-center gap-4 border-b border-separator bg-surface-secondary px-5 py-2 text-xs text-muted"
			>
				<span role="columnheader" className="min-w-0 flex-1">
					{t("storages.columnMount")}
				</span>
				<span role="columnheader" className="hidden w-24 shrink-0 sm:block">
					{t("storages.columnDriver")}
				</span>
				<span role="columnheader" className="hidden w-16 shrink-0 md:block">
					{t("storages.columnOrder")}
				</span>
				<span role="columnheader" className="w-24 shrink-0">
					{t("storages.columnStatus")}
				</span>
				<span role="columnheader" className="hidden w-40 shrink-0 lg:block">
					{t("storages.columnRemark")}
				</span>
				<span role="columnheader" className="w-56 shrink-0 text-right">
					{t("storages.columnActions")}
				</span>
			</div>
			{items.map((item) => {
				const busy = busyId === item.id;
				const enabled = !item.disabled;
				return (
					<div
						key={item.id}
						role="row"
						className="flex items-center gap-4 border-b border-separator px-5 py-4 last:border-0"
					>
						<span role="cell" className="min-w-0 flex-1">
							<button
								type="button"
								className="truncate font-medium text-foreground hover:text-accent"
								onClick={() => onOpen(item)}
							>
								{item.mount_path}
							</button>
						</span>
						<span role="cell" className="hidden w-24 shrink-0 sm:block">
							<span className="inline-block rounded-md bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-soft-foreground">
								{driverLabel(drivers, item.driver)}
							</span>
						</span>
						<span role="cell" className="hidden w-16 shrink-0 text-xs text-muted md:block">
							{item.order ?? 0}
						</span>
						<span role="cell" className="w-24 shrink-0">
							<span className={`inline-flex items-center gap-1.5 text-xs ${enabled ? "text-success" : "text-muted"}`}>
								<span aria-hidden="true" className={`h-2 w-2 rounded-full ${enabled ? "bg-success" : "bg-muted"}`} />
								{enabled ? t("storages.enabled") : t("storages.disabled")}
							</span>
						</span>
						<span role="cell" className="hidden w-40 shrink-0 truncate text-xs text-muted lg:block">
							{item.remark || "—"}
						</span>
						<span role="cell" className="flex w-56 shrink-0 justify-end gap-1">
							<button type="button" className={ACTION_CLASS} disabled={busy} onClick={() => onEdit(item)}>
								{t("action.edit")}
							</button>
							<button type="button" className={ACTION_CLASS} disabled={busy} onClick={() => onToggle(item)}>
								{enabled ? t("storages.disable") : t("storages.enable")}
							</button>
							<button
								type="button"
								className={`${ACTION_CLASS} hover:bg-danger-soft hover:text-danger-soft-foreground`}
								disabled={busy}
								onClick={() => onDelete(item)}
							>
								{t("action.delete")}
							</button>
						</span>
					</div>
				);
			})}
		</div>
	);
}

/** Placeholder shaped like the table, so the layout does not jump on load. */
export function StorageTableSkeleton() {
	return (
		<div className="divide-y divide-separator">
			{Array.from({ length: 4 }, (_, index) => (
				<div key={index} className="flex items-center gap-4 px-5 py-4">
					<Skeleton className="h-4 w-1/4 rounded-md" />
					<Skeleton className="hidden h-5 w-16 rounded-md sm:block" />
					<Skeleton className="ml-auto h-4 w-32 rounded-md" />
				</div>
			))}
		</div>
	);
}

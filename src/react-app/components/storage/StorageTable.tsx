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

/* Row actions: `rounded-md` rather than `rounded-control`, because the driver
   chip in the same row is one, and two small boxes in one row with different
   corners is the drift this pass is for. See `--radius-control` in index.css. */
const ACTION_CLASS =
	"tap rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-secondary hover:text-foreground disabled:opacity-50";

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
						className="tint flex items-center gap-4 border-b border-separator px-5 py-4 last:border-0 hover:bg-surface-secondary"
					>
						<span role="cell" className="min-w-0 flex-1">
							<button
								type="button"
								className="tint truncate font-medium text-foreground hover:text-accent"
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
							{/* One colour, declared once: the dot takes the status colour
							    from the text beside it through `currentColor`. */}
							<span className={`inline-flex items-center gap-1.5 text-xs ${enabled ? "text-success" : "text-muted"}`}>
								<span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
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

/**
 * Placeholder shaped like the table.
 *
 * It mirrors the real header, column for column and breakpoint for breakpoint,
 * the way `FileListSkeleton` mirrors the file list. The previous version had
 * three columns that did not line up with the table's six, so the header labels
 * appeared as the rows settled and pushed everything down — the jump a skeleton
 * exists to prevent.
 */
export function StorageTableSkeleton() {
	return (
		<div>
			<div className="flex items-center gap-4 border-b border-separator bg-surface-secondary px-5 py-2">
				<span className="min-w-0 flex-1">
					<Skeleton className="h-3 w-20 rounded-md" />
				</span>
				<span className="hidden w-24 shrink-0 sm:block">
					<Skeleton className="h-3 w-12 rounded-md" />
				</span>
				<span className="hidden w-16 shrink-0 md:block">
					<Skeleton className="h-3 w-8 rounded-md" />
				</span>
				<span className="w-24 shrink-0">
					<Skeleton className="h-3 w-10 rounded-md" />
				</span>
				<span className="hidden w-40 shrink-0 lg:block">
					<Skeleton className="h-3 w-16 rounded-md" />
				</span>
				<span className="w-56 shrink-0" />
			</div>
			<div className="divide-y divide-separator">
				{Array.from({ length: 4 }, (_, index) => (
					<div key={index} className="flex items-center gap-4 px-5 py-4">
						<span className="min-w-0 flex-1">
							<Skeleton className="h-4 w-2/5 rounded-md" />
						</span>
						<span className="hidden w-24 shrink-0 sm:block">
							<Skeleton className="h-5 w-16 rounded-md" />
						</span>
						<span className="hidden w-16 shrink-0 md:block">
							<Skeleton className="h-4 w-8 rounded-md" />
						</span>
						<span className="w-24 shrink-0">
							<Skeleton className="h-4 w-14 rounded-md" />
						</span>
						<span className="hidden w-40 shrink-0 lg:block">
							<Skeleton className="h-4 w-24 rounded-md" />
						</span>
						<span className="flex w-56 shrink-0 justify-end gap-1">
							{/* Three action-sized boxes, so `rounded-md` like `ACTION_CLASS`. */}
							<Skeleton className="h-6 w-10 rounded-md" />
							<Skeleton className="h-6 w-12 rounded-md" />
							<Skeleton className="h-6 w-12 rounded-md" />
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button as HeroButton, Card as HeroCard } from "@heroui/react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { driverFor, fetchDrivers, newStorage, type DriverInfo } from "../lib/drivers";
import type { Storage } from "../lib/types";
import { ROUTES } from "../routes";
import { useConfirm } from "../hooks/useConfirm";
import { useNotify } from "../hooks/useNotify";
import { StorageForm } from "../components/storage/StorageForm";
import { StorageJsonDialog } from "../components/storage/StorageJsonDialog";
import { StorageTable, StorageTableSkeleton } from "../components/storage/StorageTable";

/** The registry key for a storage, tolerating the OpenList spellings in backups. */
function driverKeyOf(item: Storage, drivers: readonly DriverInfo[]): string {
	return driverFor(drivers, item.driver)?.key ?? String(item.driver).toLowerCase();
}

export function StoragesPage() {
	const notify = useNotify();
	const confirm = useConfirm();
	const navigate = useNavigate();
	const [items, setItems] = useState<Storage[]>([]);
	const [drivers, setDrivers] = useState<DriverInfo[]>([]);
	const [editing, setEditing] = useState<Storage | null>(null);
	const [json, setJson] = useState<"import" | "export" | null>(null);
	const [filter, setFilter] = useState<string[]>([]);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [formError, setFormError] = useState("");

	const load = useCallback(async () => {
		try {
			const data = await api<{ content: Storage[] }>("/api/admin/storage/list");
			setItems(data.content ?? []);
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to load storages", true);
		} finally {
			setLoading(false);
		}
	}, [notify]);

	// The registry is what the form is built from, so it is fetched once. It only
	// changes with a deploy, and a stale answer costs a field that the worker
	// would reject anyway.
	useEffect(() => {
		void (async () => {
			try {
				setDrivers(await fetchDrivers());
			} catch (reason) {
				notify(reason instanceof Error ? reason.message : "Unable to load drivers", true);
			}
		})();
	}, [notify]);

	useEffect(() => {
		void load();
	}, [load]);

	// Only the drivers that are actually in use get a filter chip; a chip for a
	// driver nobody mounted would be a control with nothing behind it.
	const chips = useMemo(() => {
		const used = new Set(items.map((item) => driverKeyOf(item, drivers)));
		return drivers.filter((driver) => used.has(driver.key));
	}, [items, drivers]);

	const visible = useMemo(
		() => (filter.length ? items.filter((item) => filter.includes(driverKeyOf(item, drivers))) : items),
		[items, filter, drivers],
	);

	function toggleFilter(key: string) {
		setFilter((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
	}

	function add() {
		setFormError("");
		setEditing(newStorage(drivers.find((driver) => driver.key === "object") ?? drivers[0]));
	}

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!editing) return;
		const trimmed = editing.mount_path.replace(/^\/+/, "").replace(/\/+$/, "");
		const mountPath = trimmed ? `/${trimmed}` : "/";
		if (items.some((item) => item.id !== editing.id && item.mount_path.replace(/\/+$/, "") === mountPath)) {
			setFormError("挂载路径必须唯一");
			return;
		}
		const payload = { ...editing, mount_path: mountPath };
		// Create and update are separate endpoints: `update` insists on an id, so
		// posting a new storage there would be a 400 rather than an insert.
		const endpoint = editing.id > 0 ? "/api/admin/storage/update" : "/api/admin/storage/create";
		try {
			await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
			notify("Storage saved");
			setEditing(null);
			await load();
		} catch (reason) {
			setFormError(reason instanceof Error ? reason.message : "Unable to save storage");
		}
	}

	async function toggle(item: Storage) {
		setBusyId(item.id);
		try {
			const action = item.disabled ? "enable" : "disable";
			await api(`/api/admin/storage/${action}?id=${item.id}`, { method: "POST" });
			await load();
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to change the storage", true);
		} finally {
			setBusyId(null);
		}
	}

	async function reloadAll() {
		try {
			await api("/api/admin/storage/load_all", { method: "POST" });
			await load();
			notify("Storages reloaded");
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to reload storages", true);
		}
	}

	async function remove(item: Storage) {
		if (!(await confirm({ title: "Delete storage", message: `Delete ${item.mount_path}?` }))) return;
		setBusyId(item.id);
		try {
			await api("/api/admin/storage/delete", {
				method: "POST",
				body: JSON.stringify({ id: item.id, mount_path: item.mount_path }),
			});
			notify("Storage deleted");
			await load();
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to delete storage", true);
		} finally {
			setBusyId(null);
		}
	}

	return (
		<section>
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-sm text-muted">Manage</p>
					<h1 className="mt-1 text-2xl font-semibold">Storages</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<HeroButton size="sm" variant="ghost" onPress={() => void reloadAll()}>
						Reload all
					</HeroButton>
					<HeroButton size="sm" variant="outline" onPress={() => void load()}>
						Refresh
					</HeroButton>
					<HeroButton onPress={add}>Add storage</HeroButton>
				</div>
			</div>

			{chips.length > 1 && (
				<div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by driver">
					{chips.map((driver) => {
						const active = filter.includes(driver.key);
						return (
							<button
								key={driver.key}
								type="button"
								aria-pressed={active}
								onClick={() => toggleFilter(driver.key)}
								className={`rounded-full border px-3 py-1 text-xs transition-colors ${
									active
										? "border-accent bg-accent-soft text-accent-soft-foreground"
										: "border-border text-muted hover:text-foreground"
								}`}
							>
								{driver.name}
							</button>
						);
					})}
					{filter.length > 0 && (
						<button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => setFilter([])}>
							Clear
						</button>
					)}
				</div>
			)}

			<HeroCard className="overflow-hidden p-0" variant="default">
				{loading ? (
					<StorageTableSkeleton />
				) : !items.length ? (
					<p className="p-8 text-sm text-muted">No storage configured.</p>
				) : !visible.length ? (
					<p className="p-8 text-sm text-muted">No storage matches the selected drivers.</p>
				) : (
					<StorageTable
						items={visible}
						drivers={drivers}
						busyId={busyId}
						onOpen={(item) => navigate({ pathname: ROUTES.files(item.mount_path) })}
						onEdit={(item) => {
							setFormError("");
							setEditing(item);
						}}
						onToggle={(item) => void toggle(item)}
						onDelete={(item) => void remove(item)}
					/>
				)}
			</HeroCard>

			{editing && (
				<StorageForm
					drivers={drivers}
					draft={editing}
					onChange={setEditing}
					onSave={save}
					onClose={() => setEditing(null)}
					onOpenJson={setJson}
					error={formError}
				/>
			)}
			{editing && json && (
				<StorageJsonDialog
					mode={json}
					storage={editing}
					onImport={(imported) => {
						setEditing(imported);
						setJson(null);
						notify("Storage loaded from JSON");
					}}
					onClose={() => setJson(null)}
				/>
			)}
		</section>
	);
}

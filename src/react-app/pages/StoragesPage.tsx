import { type FormEvent, useEffect, useState } from "react";
import { Button as HeroButton, Card as HeroCard } from "@heroui/react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { newStorage, storageForEditor } from "../lib/storage";
import type { Storage } from "../lib/types";
import { ROUTES } from "../routes";
import { useConfirm } from "../hooks/useConfirm";
import { useNotify } from "../hooks/useNotify";
import { StorageEditor } from "../components/storage/StorageEditor";

export function StoragesPage() {
	const notify = useNotify();
	const confirm = useConfirm();
	const navigate = useNavigate();
	const [items, setItems] = useState<Storage[]>([]); const [editing, setEditing] = useState<Storage | null>(null); const [loading, setLoading] = useState(true); const [formError, setFormError] = useState("");
	async function load() { try { const data = await api<{ content: Storage[] }>("/api/admin/storage/list"); setItems((data.content ?? []).map(storageForEditor)); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to load storages", true); } finally { setLoading(false); } }
	// The storage list is loaded once when the management view opens.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => { void load(); }, []);
	function edit(item: Storage) { setFormError(""); setEditing(item); }
	async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editing) return; const trimmed = editing.mount_path.replace(/^\/+/, "").replace(/\/+$/, "");
		const mountPath = trimmed ? `/${trimmed}` : "/"; if (items.some((item) => item.id !== editing.id && item.mount_path.replace(/\/+$/, "") === mountPath.replace(/\/+$/, ""))) { setFormError("挂载路径必须唯一"); return; } const payload = { ...editing, mount_path: mountPath, order_by: editing.order_by ?? "name", order_direction: editing.order_direction ?? "asc", extract_folder: editing.extract_folder ?? "front" }; try { await api("/api/admin/storage/create", { method: "POST", body: JSON.stringify(payload) }); notify("Storage saved"); setEditing(null); await load(); } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Unable to save storage"); } }
	async function remove(item: Storage) {
		if (!(await confirm({ title: "Delete storage", message: `Delete ${item.mount_path}?` }))) return;
		try { await api("/api/admin/storage/delete", { method: "POST", body: JSON.stringify({ id: item.id, mount_path: item.mount_path }) }); notify("Storage deleted"); await load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to delete storage", true); } }
	return <section><div className="mb-5 flex items-center justify-between"><div><p className="text-sm text-slate-400">Manage</p><h1 className="mt-1 text-2xl font-semibold">Storages</h1></div><HeroButton onPress={() => edit(newStorage())}>Add storage</HeroButton></div><HeroCard className="overflow-hidden p-0" variant="default"><div>{loading ? <p className="p-8 text-sm text-slate-400">Loading…</p> : !items.length ? <p className="p-8 text-sm text-slate-400">No storage configured.</p> : items.map((item) => <div key={item.id} className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-0"><span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold uppercase text-blue-700">{String(item.driver).toLowerCase() === "object" || String(item.driver).toLowerCase() === "s3" ? "S3" : item.driver}</span><div className="min-w-0 flex-1"><button className="font-medium hover:text-blue-600" onClick={() => navigate({ pathname: ROUTES.files(item.mount_path) })}>{item.mount_path}</button><p className="truncate text-xs text-slate-400">{item.remark || "No description"}</p></div><HeroButton size="sm" variant="ghost" onPress={() => edit(item)}>Edit</HeroButton><HeroButton size="sm" variant="danger-soft" onPress={() => void remove(item)}>Delete</HeroButton></div>)}</div></HeroCard>{editing && <StorageEditor editing={editing} setEditing={setEditing} onSave={save} onClose={() => setEditing(null)} error={formError} />}</section>;
}

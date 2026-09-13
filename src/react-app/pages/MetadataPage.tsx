import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button as HeroButton, Card as HeroCard, Switch as HeroSwitch } from "@heroui/react";
import { api } from "../lib/api";
import type { Meta } from "../lib/types";
import { useConfirm } from "../hooks/useConfirm";
import { useNotify } from "../hooks/useNotify";
import { Modal } from "../components/common/Modal";

export function MetadataPage() {
	const notify = useNotify();
	const confirm = useConfirm();
	const [items, setItems] = useState<Meta[]>([]);
	const [editing, setEditing] = useState<Meta | null>(null);
	const [loading, setLoading] = useState(true);
	const load = useCallback(async () => {
		try {
			const data = await api<{ content: Meta[] }>("/api/admin/meta/list");
			setItems(data.content ?? []);
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to load metadata", true);
		} finally {
			setLoading(false);
		}
	}, [notify]);
	useEffect(() => {
		void load();
	}, [load]);
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!editing) return;
		try {
			await api("/api/admin/meta/create", { method: "POST", body: JSON.stringify(editing) });
			notify("Metadata saved");
			setEditing(null);
			await load();
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to save metadata", true);
		}
	}
	async function remove(item: Meta) {
		if (!(await confirm({ title: "Delete rule", message: `Delete rule ${item.path}?` }))) return;
		try {
			await api("/api/admin/meta/delete", { method: "POST", body: JSON.stringify({ id: item.id, path: item.path }) });
			notify("Metadata deleted");
			await load();
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Unable to delete metadata", true);
		}
	}
	return (
		<section>
			<div className="mb-5 flex items-center justify-between">
				<div>
					<p className="text-sm text-muted">Manage</p>
					<h1 className="mt-1 text-2xl font-semibold">Metadata rules</h1>
				</div>
				<HeroButton onPress={() => setEditing({ id: 0, path: "/", write: false, hide: "", readme: "", header: "" })}>
					Add rule
				</HeroButton>
			</div>
			<HeroCard className="overflow-hidden p-0" variant="default">
				<div>
					{loading ? (
						<p className="p-8 text-sm text-muted">Loading…</p>
					) : !items.length ? (
						<p className="p-8 text-sm text-muted">No metadata rules configured.</p>
					) : (
						items.map((item) => (
							<div key={item.id} className="flex items-center gap-4 border-b border-separator px-5 py-4 last:border-0">
								<div className="min-w-0 flex-1">
									<p className="font-medium">{item.path}</p>
									<p className="truncate text-xs text-muted">
										{item.write ? "Writable" : "Read only"}
										{item.hide ? ` · Hidden: ${item.hide}` : ""}
									</p>
								</div>
								<HeroButton size="sm" variant="ghost" onPress={() => setEditing(item)}>
									Edit
								</HeroButton>
								<HeroButton size="sm" variant="danger-soft" onPress={() => void remove(item)}>
									Delete
								</HeroButton>
							</div>
						))
					)}
				</div>
			</HeroCard>
			{editing && (
				<Modal title={editing.id ? "Edit metadata rule" : "Add metadata rule"} onClose={() => setEditing(null)}>
					<form className="space-y-3" onSubmit={save}>
						<input
							required
							value={editing.path}
							onChange={(event) => setEditing({ ...editing, path: event.target.value })}
							placeholder="Path, e.g. /private"
							className="w-full rounded-lg border border-border bg-field-background px-3 py-2"
						/>
						<HeroSwitch
							isSelected={Boolean(editing.write)}
							onChange={(value) => setEditing({ ...editing, write: value })}
						>
							Allow writes
						</HeroSwitch>
						<input
							value={editing.password ?? ""}
							onChange={(event) => setEditing({ ...editing, password: event.target.value })}
							type="password"
							placeholder="Folder password"
							className="w-full rounded-lg border border-border bg-field-background px-3 py-2"
						/>
						<input
							value={editing.hide ?? ""}
							onChange={(event) => setEditing({ ...editing, hide: event.target.value })}
							placeholder="Hidden names — one regular expression per line"
							className="w-full rounded-lg border border-border bg-field-background px-3 py-2"
						/>
						{/* `h_sub` is the subfolder flag, so without this switch a `hide`
						    rule only ever covers its own directory — and until this control
						    existed the field could not be reached from the form at all. */}
						<HeroSwitch
							isSelected={Boolean(editing.h_sub)}
							onChange={(value) => setEditing({ ...editing, h_sub: value })}
						>
							Hide applies to subfolders
						</HeroSwitch>
						<textarea
							value={editing.header ?? ""}
							onChange={(event) => setEditing({ ...editing, header: event.target.value })}
							rows={3}
							placeholder="Header — markdown, or a URL to fetch"
							className="w-full rounded-lg border border-border bg-field-background px-3 py-2"
						/>
						<HeroSwitch
							isSelected={Boolean(editing.header_sub)}
							onChange={(value) => setEditing({ ...editing, header_sub: value })}
						>
							Header applies to subfolders
						</HeroSwitch>
						<textarea
							value={editing.readme ?? ""}
							onChange={(event) => setEditing({ ...editing, readme: event.target.value })}
							rows={3}
							placeholder="Readme — markdown, or a URL to fetch"
							className="w-full rounded-lg border border-border bg-field-background px-3 py-2"
						/>
						<HeroSwitch
							isSelected={Boolean(editing.r_sub)}
							onChange={(value) => setEditing({ ...editing, r_sub: value })}
						>
							Readme applies to subfolders
						</HeroSwitch>
						<HeroButton type="submit" fullWidth>
							Save metadata
						</HeroButton>
					</form>
				</Modal>
			)}
		</section>
	);
}

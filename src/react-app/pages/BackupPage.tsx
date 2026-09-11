import { useState } from "react";
import { Button as HeroButton, Card as HeroCard, Switch as HeroSwitch } from "@heroui/react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useNotify } from "../hooks/useNotify";

export function BackupPage() {
	const notify = useNotify();
	const { token } = useAuth();
	const [password, setPassword] = useState("");
	const [override, setOverride] = useState(false);
	const [loading, setLoading] = useState(false);
	async function backup() {
		setLoading(true);
		try {
			const response = await fetch("/api/admin/backup/export", {
				method: "POST",
				headers: { Authorization: token, "content-type": "application/json" },
				body: JSON.stringify({ password }),
			});
			if (!response.ok) throw new Error("Backup failed");
			const blob = await response.blob();
			const link = document.createElement("a");
			link.href = URL.createObjectURL(blob);
			link.download = "openlist_backup.json";
			link.click();
			URL.revokeObjectURL(link.href);
			notify("Backup downloaded");
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Backup failed", true);
		} finally {
			setLoading(false);
		}
	}
	async function restore(file: File) {
		setLoading(true);
		try {
			const data = JSON.parse(await file.text());
			await api("/api/admin/backup/restore", { method: "POST", body: JSON.stringify({ data, password, override }) });
			notify("Backup restored");
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : "Restore failed", true);
		} finally {
			setLoading(false);
		}
	}
	return (
		<section>
			<div className="mb-5">
				<p className="text-sm text-muted">Manage</p>
				<h1 className="mt-1 text-2xl font-semibold">Backup & restore</h1>
			</div>
			<HeroCard className="max-w-xl" variant="default">
				<p className="text-sm text-muted">
					Export an OpenList-compatible JSON backup or restore one previously created by OpenList/EdgeList.
				</p>
				<label className="mt-5 block text-sm font-medium">
					Encryption password
					<input
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="Optional"
						className="mt-2 w-full rounded-lg border border-border bg-field-background px-3 py-2 font-normal"
					/>
				</label>
				<HeroSwitch className="mt-4" isSelected={override} onChange={setOverride}>
					Override matching storages and metadata
				</HeroSwitch>
				<div className="mt-6 flex flex-wrap gap-3">
					<HeroButton isDisabled={loading} onPress={() => void backup()}>
						Download backup
					</HeroButton>
					<label className="inline-flex cursor-pointer items-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-secondary">
						Choose backup
						<input
							hidden
							type="file"
							accept="application/json"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void restore(file);
								event.target.value = "";
							}}
						/>
					</label>
				</div>
			</HeroCard>
		</section>
	);
}

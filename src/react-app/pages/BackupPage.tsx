import { useState } from "react";
import { Button as HeroButton, Card as HeroCard, Switch as HeroSwitch } from "@heroui/react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useT } from "../hooks/useLocale";
import { useNotify } from "../hooks/useNotify";

export function BackupPage() {
	const t = useT();
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
			if (!response.ok) throw new Error(t("backup.exportFailed"));
			const blob = await response.blob();
			const link = document.createElement("a");
			link.href = URL.createObjectURL(blob);
			link.download = "openlist_backup.json";
			link.click();
			URL.revokeObjectURL(link.href);
			notify(t("backup.downloaded"));
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : t("backup.exportFailed"), true);
		} finally {
			setLoading(false);
		}
	}
	async function restore(file: File) {
		setLoading(true);
		try {
			const data = JSON.parse(await file.text());
			await api("/api/admin/backup/restore", { method: "POST", body: JSON.stringify({ data, password, override }) });
			notify(t("backup.restored"));
		} catch (reason) {
			notify(reason instanceof Error ? reason.message : t("backup.restoreFailed"), true);
		} finally {
			setLoading(false);
		}
	}
	return (
		<section>
			<div className="mb-5">
				<p className="text-sm text-muted">{t("manage.eyebrow")}</p>
				<h1 className="mt-1 text-2xl font-semibold">{t("backup.heading")}</h1>
			</div>
			<HeroCard className="max-w-xl" variant="default">
				<p className="text-sm text-muted">{t("backup.intro")}</p>
				<label className="mt-5 block text-sm font-medium">
					{t("backup.password")}
					<input
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder={t("backup.passwordPlaceholder")}
						className="mt-2 w-full px-3 py-2 font-normal"
					/>
				</label>
				<HeroSwitch className="mt-4" isSelected={override} onChange={setOverride}>
					{t("backup.override")}
				</HeroSwitch>
				<div className="mt-6 flex flex-wrap gap-3">
					<HeroButton isDisabled={loading} onPress={() => void backup()}>
						{t("backup.download")}
					</HeroButton>
					{/* A `<label>` dressing as a button, so it takes the control corner:
					    it sits beside a real `HeroButton` and the two have to look like
					    the same family. */}
					<label className="tint inline-flex cursor-pointer items-center rounded-control border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-secondary">
						{t("backup.choose")}
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

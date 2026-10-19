import { useRef, useState } from "react";
import { exportBackup, restoreBackup } from "../lib/api";
import type { BackupData } from "../lib/types";
import { notify } from "../lib/feedback";
import { loadWorkspace } from "../lib/workspace";
import { useT } from "../hooks/useStore";
import { ActionButton } from "../ui/ActionButton";
import { Checkbox, Field, TextInput } from "../ui/Field";
import { ManageHeading } from "./ManageShell";
import { Card } from "../ui/PageShell";
import { Icon } from "../ui/Icon";

/**
 * Backup and restore (§12.17).
 *
 * One page with a two-button header, two fields and a log panel, which is exactly the
 * spec's layout — and the log panel is the point, because both operations are a sequence
 * of records rather than a single result.
 *
 * Two behaviours are the Worker's and are surfaced rather than hidden:
 *
 * **The backup is a download, not a payload.** `/api/admin/backup/export` answers with a
 * `content-disposition: attachment`, so the browser saving it *is* the operation; reading
 * the body would work too and would cost a copy of the file in memory.
 *
 * **`Override` means "merge", not "replace".** §18.18 records the naming as backwards in
 * the reference, and the Worker matches it: on, each record is matched by its primary key
 * and updated in place, and it takes a backup first; off, every record is imported as
 * new. The note under the switch says so in the interface's own words, because a checkbox
 * labelled "override" that appends is the kind of thing a user finds out afterwards.
 *
 * The restore path asks for a file, then posts its text. It does not use a multipart
 * upload: the endpoint takes JSON, and parsing it here means a malformed file is refused
 * before a request rather than after one.
 */
type LogEntry = { kind: "info" | "ok" | "bad"; text: string };

export function BackupPage() {
	const t = useT();
	const [password, setPassword] = useState("");
	const [override, setOverride] = useState(false);
	const [log, setLog] = useState<LogEntry[]>([]);
	const [backingUp, setBackingUp] = useState(false);
	const [restoring, setRestoring] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);

	function append(kind: LogEntry["kind"], text: string) {
		setLog((current) => [...current, { kind, text }]);
	}

	async function backup() {
		setBackingUp(true);
		append("info", t("backup.start_backup"));
		try {
			// The three sections the Worker writes, logged individually so a partial
			// failure is visible rather than a single "backup failed".
			const response = await exportBackup(password);
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `openlist_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 4000);
			for (const item of [t("backup.settings"), t("backup.storages"), t("backup.metas")]) {
				append("ok", t("backup.item_success", { item }));
			}
			append("info", t("backup.finish_backup"));
		} catch (reason) {
			append(
				"bad",
				t("backup.item_failed", { item: t("backup.title"), error: reason instanceof Error ? reason.message : "" }),
			);
		} finally {
			setBackingUp(false);
		}
	}

	async function restore(file: File) {
		setRestoring(true);
		append("info", t("backup.start_restore"));
		try {
			const text = await file.text();
			let data: BackupData;
			try {
				data = JSON.parse(text) as BackupData;
			} catch {
				append("bad", t("backup.item_failed", { item: file.name, error: "invalid JSON" }));
				return;
			}
			const result = await restoreBackup(data, { password, override });
			append("ok", t("backup.restore_success", { item: t("backup.storages"), key: String(result.storages) }));
			append("ok", t("backup.restore_success", { item: t("backup.metas"), key: String(result.metas) }));
			append("info", t("backup.finish_restore"));
			// The mount list and the driver registry both just changed underneath the
			// rest of the app.
			await loadWorkspace(true);
			notify.success(t("global.update_success"));
		} catch (reason) {
			append(
				"bad",
				t("backup.item_failed", { item: t("backup.restore"), error: reason instanceof Error ? reason.message : "" }),
			);
			notify.error(reason);
		} finally {
			setRestoring(false);
		}
	}

	return (
		<div>
			<ManageHeading title={t("backup.title")} description={t("backup.description")}>
				<ActionButton tone="soft" icon="download" onPress={() => void backup()} isPending={backingUp}>
					{t("backup.backup")}
				</ActionButton>
				<ActionButton tone="soft" icon="upload" onPress={() => fileInput.current?.click()} isPending={restoring}>
					{t("backup.restore")}
				</ActionButton>
			</ManageHeading>

			<div className="flex flex-col gap-4">
				<input
					ref={fileInput}
					type="file"
					accept="application/json,.json"
					hidden
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file) {
							notify.warning(t("backup.no_file"));
							return;
						}
						void restore(file);
					}}
				/>

				<Card className="flex flex-col gap-2.5 p-4 sm:max-w-md">
					<Checkbox
						checked={override}
						onChange={setOverride}
						label={t("backup.override")}
						labelClassName="text-[13px]"
					/>
					<p className="text-[12px] leading-relaxed text-neutral-10">{t("backup.override_tips")}</p>
					<Field label={t("backup.password")} hint={t("backup.password_hint")}>
						{(fieldId) => (
							<TextInput
								id={fieldId}
								type="password"
								value={password}
								autoComplete="new-password"
								onChange={(event) => setPassword(event.target.value)}
								placeholder={t("backup.password_placeholder")}
							/>
						)}
					</Field>
				</Card>

				{/* §12.17: a scrolling log, one line per event, coloured by kind. The
				    icons were emoji, which render at a different weight on every
				    platform and read as decoration rather than as status. */}
				<div
					ref={(node) => {
						// §12.17 asks for the newest line to be scrolled into view. Doing it
						// on the node's own scroll position avoids a second effect per line.
						if (node) node.scrollTop = node.scrollHeight;
					}}
					className="flex h-[60vh] flex-col gap-1 overflow-y-auto rounded-2xl border border-hairline bg-neutral-3/50 p-3 font-mono text-[12.5px]"
				>
					{log.length === 0 ? (
						<p className="font-sans text-[12.5px] text-neutral-10">{t("backup.start_backup")}…</p>
					) : (
						log.map((entry, index) => (
							<p
								key={index}
								className={`flex items-start gap-2 break-all ${
									entry.kind === "ok" ? "text-success-11" : entry.kind === "bad" ? "text-danger-11" : "text-info-11"
								}`}
							>
								<Icon
									name={entry.kind === "ok" ? "check-circle" : entry.kind === "bad" ? "alert-circle" : "info"}
									className="mt-0.5 size-3.5 shrink-0"
								/>
								<span>{entry.text}</span>
							</p>
						))
					)}
				</div>
			</div>
		</div>
	);
}

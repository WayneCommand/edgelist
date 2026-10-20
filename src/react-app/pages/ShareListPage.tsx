import { useCallback, useEffect, useState } from "react";
import { deleteShare, listShares, updateShare, type ShareView } from "../lib/api";
import { confirm, notify } from "../lib/feedback";
import { formatDate } from "../lib/format";
import { useT } from "../hooks/useStore";
import { ActionButton } from "../ui/ActionButton";
import { Chip, Loading, StateMessage } from "../ui/Field";
import { ShareDialog } from "../components/ShareDialog";
import { ManageHeading } from "./ManageShell";

/**
 * Shares (§12.11).
 *
 * A share is a metadata rule with `share: true`, so this page is a *view* over
 * the metadata store rather than a store of its own: removing a row here makes
 * the link stop working, and deleting the rule from the Metas page does the same
 * thing. That is the point of modelling it this way — there is one answer to
 * "what is shared", and these rows are it.
 *
 * The columns are the ones that change a decision: what is shared, whether it
 * works right now, how close it is to its limit, and when it lapses. The link
 * itself is one click away rather than printed in the table, because a table full
 * of URLs is unreadable and the URL is the thing you copy, not the thing you scan.
 */
export function ShareListPage() {
	const t = useT();
	const [rows, setRows] = useState<(ShareView & { state: string })[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<string | null>(null);
	const [editing, setEditing] = useState<ShareView | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const page = await listShares();
			setRows(page.content ?? []);
		} catch (reason) {
			notify.error(reason);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function copyLink(share: ShareView) {
		try {
			await navigator.clipboard.writeText(share.url);
			notify.success(t("global.copied"));
		} catch {
			notify.error(t("global.clipboard_denied"));
		}
	}

	async function toggle(share: ShareView) {
		setBusy(share.id);
		try {
			await updateShare({ path: share.path, share_enabled: !share.enabled });
			await refresh();
		} catch (reason) {
			notify.error(reason);
		} finally {
			setBusy(null);
		}
	}

	async function remove(share: ShareView) {
		const ok = await confirm({
			title: t("global.delete"),
			message: t("share.delete_confirm", { name: share.name }),
			confirmLabel: t("global.confirm"),
			danger: true,
		});
		if (!ok) return;
		setBusy(share.id);
		try {
			await deleteShare(share.path);
			notify.success(t("share.deleted"));
			await refresh();
		} catch (reason) {
			notify.error(reason);
		} finally {
			setBusy(null);
		}
	}

	return (
		<div>
			<ManageHeading title={t("share.title")} description={t("share.description")}>
				<ActionButton tone="accent" icon="refresh" size="sm" isPending={loading} onPress={() => void refresh()}>
					{t("global.refresh")}
				</ActionButton>
			</ManageHeading>

			{loading ? (
				<div className="flex justify-center py-16">
					<Loading size="lg" />
				</div>
			) : rows.length === 0 ? (
				<StateMessage icon="share" title={t("share.empty")} description={t("share.empty_hint")} />
			) : (
				<div className="glass-panel overflow-x-auto rounded-2xl border border-hairline shadow-sm">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-hairline bg-neutral-3/40 text-left text-[11px] font-semibold tracking-[0.04em] text-neutral-11 uppercase">
								<th className="px-3 py-2">{t("share.path")}</th>
								<th className="px-3 py-2">{t("share.id")}</th>
								<th className="px-3 py-2">{t("share.status")}</th>
								<th className="px-3 py-2">{t("share.expires")}</th>
								<th className="px-3 py-2">{t("share.views")}</th>
								<th className="px-3 py-2 text-right">{t("share.operations")}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((share) => (
								<tr key={share.path} className="border-b border-hairline last:border-0 hover:bg-row-hover">
									<td className="px-3 py-2">
										<div className="font-medium break-all">{share.name}</div>
										{share.remark && <div className="text-[11px] text-neutral-10">{share.remark}</div>}
									</td>
									<td className="px-3 py-2 font-mono text-[12px] text-neutral-11">{share.id}</td>
									<td className="px-3 py-2">
										<Chip tone={share.state === "work" ? "success" : share.state === "disabled" ? "neutral" : "danger"}>
											{t(`share.state.${share.state}` as "share.state.work")}
										</Chip>
									</td>
									<td className="px-3 py-2 text-[12px] text-neutral-11">
										{share.expires ? formatDate(share.expires) : "-"}
									</td>
									<td className="px-3 py-2 text-[12px] text-neutral-11 tabular-nums">
										{share.views}
										{share.max_views > 0 ? ` / ${share.max_views}` : ""}
									</td>
									<td className="px-3 py-2">
										<div className="flex items-center justify-end gap-1">
											<ActionButton tone="primary" size="sm" icon="copy" onPress={() => void copyLink(share)}>
												{t("share.copy_link")}
											</ActionButton>
											<ActionButton tone="soft" size="sm" onPress={() => setEditing(share)}>
												{t("global.edit")}
											</ActionButton>
											<ActionButton
												tone="ghost"
												size="sm"
												isPending={busy === share.id}
												onPress={() => void toggle(share)}
											>
												{share.enabled ? t("global.disable") : t("global.enable")}
											</ActionButton>
											<ActionButton
												tone="ghost"
												size="sm"
												icon="trash"
												iconOnly
												aria-label={t("global.delete")}
												className="text-danger-11"
												onPress={() => void remove(share)}
											/>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{editing && (
				<ShareDialog
					path={editing.path}
					name={editing.name}
					state={{ shared: true, share: editing }}
					onClose={() => setEditing(null)}
					onChanged={() => void refresh()}
				/>
			)}
		</div>
	);
}

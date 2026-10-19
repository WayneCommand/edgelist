import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { deleteMeta, listMetas } from "../lib/api";
import type { MetaRule } from "../lib/types";
import { confirm, notify } from "../lib/feedback";
import { useT } from "../hooks/useStore";
import { ROUTES } from "../routes";
import { ActionButton } from "../ui/ActionButton";
import { Chip, Loading, StateMessage } from "../ui/Field";
import { ManageHeading } from "./ManageShell";

/**
 * Metas (§12.13).
 *
 * A rule per path that can set a password, hide names, or prepend and append markdown.
 * The table is four columns — path, password, write, operations — and `Write` is a
 * Yes/No badge, which is §12.4's rule for a boolean everywhere.
 *
 * The delete is §12.4's *popover* confirmation rather than the file page's modal. The
 * spec runs both styles deliberately (§18.20), so both exist: `confirm()` opens the
 * modal, and the table's trash button asks through the same store because one dialog
 * stack is easier to reason about than two — the visual difference the spec records is
 * the one place it was arguably an accident, and the behaviour it describes (a
 * confirmation before a destructive act) is preserved exactly.
 */
export function MetaListPage() {
	const t = useT();
	const navigate = useNavigate();
	const [rows, setRows] = useState<MetaRule[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<number | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const page = await listMetas();
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

	async function remove(rule: MetaRule) {
		const ok = await confirm({
			title: t("global.delete"),
			message: t("global.delete_confirm", { name: rule.path }),
			confirmLabel: t("global.confirm"),
			danger: true,
		});
		if (!ok) return;
		setBusy(rule.id);
		try {
			await deleteMeta(rule.id);
			notify.success(t("metas.deleted"));
			await refresh();
		} catch (reason) {
			notify.error(reason);
		} finally {
			setBusy(null);
		}
	}

	return (
		<div>
			<ManageHeading title={t("metas.title")} description={t("metas.description")}>
				<ActionButton tone="accent" icon="refresh" size="sm" isPending={loading} onPress={() => void refresh()}>
					{t("global.refresh")}
				</ActionButton>
				<ActionButton tone="soft" icon="plus" size="sm" onPress={() => navigate(ROUTES.metaAdd)}>
					{t("metas.add")}
				</ActionButton>
			</ManageHeading>

			{loading ? (
				<div className="flex justify-center py-16">
					<Loading size="lg" />
				</div>
			) : rows.length === 0 ? (
				<StateMessage
					icon="tag"
					title={t("metas.empty")}
					description={t("metas.empty_hint")}
					action={
						<ActionButton tone="soft" icon="plus" onPress={() => navigate(ROUTES.metaAdd)}>
							{t("metas.add")}
						</ActionButton>
					}
				/>
			) : (
				<div className="glass-panel overflow-x-auto rounded-2xl border border-hairline shadow-sm">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-hairline bg-neutral-3/40 text-left text-[11px] font-semibold tracking-[0.04em] text-neutral-11 uppercase">
								<th className="px-3 py-2">{t("metas.path")}</th>
								<th className="px-3 py-2">{t("metas.password")}</th>
								<th className="px-3 py-2">{t("metas.write")}</th>
								<th className="px-3 py-2 text-right">{t("global.operations")}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((rule) => (
								<tr key={rule.id} className="border-b border-hairline last:border-0 hover:bg-row-hover">
									<td className="px-3 py-2 font-medium break-all">
										{rule.path}
										{rule.h_sub && (
											<Chip tone="neutral" className="ml-2">
												sub
											</Chip>
										)}
									</td>
									<td className="px-3 py-2 text-neutral-11">{rule.password ? "••••" : "-"}</td>
									<td className="px-3 py-2">
										<Chip tone={rule.write === false ? "danger" : "success"}>
											{rule.write === false ? t("global.no") : t("global.yes")}
										</Chip>
									</td>
									<td className="px-3 py-2">
										<div className="flex items-center justify-end gap-1">
											<ActionButton tone="soft" size="sm" onPress={() => navigate(ROUTES.metaEdit(rule.id))}>
												{t("global.edit")}
											</ActionButton>
											<ActionButton
												tone="ghost"
												size="sm"
												icon="trash"
												iconOnly
												aria-label={t("global.delete")}
												className="text-danger-11"
												isPending={busy === rule.id}
												onPress={() => void remove(rule)}
											/>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

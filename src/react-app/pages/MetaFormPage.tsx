import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { listMetas, saveMeta } from "../lib/api";
import type { MetaRule } from "../lib/types";
import { notify } from "../lib/feedback";
import { useT } from "../hooks/useStore";
import { ROUTES } from "../routes";
import { ActionButton } from "../ui/ActionButton";
import { Checkbox, Field, Loading, StateMessage, Switch, TextArea, TextInput } from "../ui/Field";
import { ManageHeading } from "./ManageShell";
import { Card } from "../ui/PageShell";

/**
 * A metadata rule (§12.13).
 *
 * Every field is a row: label, control, and its own "apply to sub folder" checkbox on
 * the same line, which is what the spec's table asks for. The `_sub` flags are per field
 * rather than one switch for the rule because that is how the Worker resolves them — a
 * rule on `/docs` can put a readme on `/docs` alone while its header reaches everything
 * beneath it (`meta.ts:metaReadme` / `metaHeader`).
 *
 * The two permission lists — read users and write users — are index lists of a user
 * directory this deployment does not have: the Worker authenticates one key pair and
 * every request runs as id 0. The fields are kept because they are part of an OpenList
 * backup and dropping them would make an import lossy, and a note says so rather than
 * offering a picker with nothing in it.
 */
export function MetaFormPage() {
	const t = useT();
	const navigate = useNavigate();
	const { id } = useParams();
	const editing = Boolean(id);
	const [draft, setDraft] = useState<MetaRule | null>(null);
	const [loading, setLoading] = useState(editing);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!editing) {
			setDraft({ id: 0, path: "", write: true, hide: "", readme: "", header: "" });
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const page = await listMetas();
				const found = (page.content ?? []).find((rule) => rule.id === Number(id));
				if (cancelled) return;
				if (found) setDraft(found);
				else setError(t("metas.load_failed"));
			} catch (reason) {
				if (!cancelled) setError(reason instanceof Error ? reason.message : t("metas.load_failed"));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [editing, id, t]);

	if (loading) {
		return (
			<div className="flex justify-center py-16">
				<Loading size="lg" />
			</div>
		);
	}

	if (error || !draft) {
		return (
			<StateMessage icon="alert-triangle" tone="danger" title={error || t("metas.load_failed")} className="py-16" />
		);
	}

	function set<K extends keyof MetaRule>(key: K, value: MetaRule[K]) {
		setDraft({ ...draft!, [key]: value });
	}

	async function save() {
		setSaving(true);
		try {
			await saveMeta({ ...draft!, id: Number(id) || 0, path: draft!.path.trim() });
			notify.success(t("metas.saved"));
			navigate(ROUTES.metas);
		} catch (reason) {
			notify.error(reason);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div>
			<ManageHeading title={editing ? t("global.edit") : t("metas.add")}>
				<ActionButton tone="soft" icon="arrow-left" size="sm" onPress={() => navigate(ROUTES.metas)}>
					{t("global.back")}
				</ActionButton>
			</ManageHeading>

			<Card className="flex max-w-3xl flex-col gap-4 p-4">
				{/* The path is typed rather than picked: a rule can name a directory that does
				    not exist yet, and a picker would make it unrepresentable. */}
				<Field label={t("metas.path")} hint={t("metas.path_placeholder")} required>
					{(fieldId) => (
						<TextInput
							id={fieldId}
							value={draft!.path}
							onChange={(event) => set("path", event.target.value)}
							placeholder="/private"
						/>
					)}
				</Field>

				<Row label={t("metas.password")} sub={draft.p_sub} onSub={(value) => set("p_sub", value)}>
					{(fieldId) => (
						<TextInput
							id={fieldId}
							type="password"
							value={draft!.password ?? ""}
							onChange={(event) => set("password", event.target.value)}
						/>
					)}
				</Row>

				<Row label={t("metas.write")} sub={draft.w_sub} onSub={(value) => set("w_sub", value)}>
					{() => <Switch checked={draft!.write !== false} onChange={(value) => set("write", value)} />}
				</Row>

				<Row label={t("metas.write_bypass")} hint={t("metas.bypass_help")}>
					{() => (
						<Switch
							checked={draft!.write_content_bypass === true}
							onChange={(value) => set("write_content_bypass", value)}
						/>
					)}
				</Row>

				<Row
					label={t("metas.hide")}
					sub={draft.h_sub}
					onSub={(value) => set("h_sub", value)}
					hint={t("metas.hide_help")}
				>
					{(fieldId) => (
						<TextArea
							id={fieldId}
							rows={3}
							value={draft!.hide ?? ""}
							onChange={(event) => set("hide", event.target.value)}
						/>
					)}
				</Row>

				<Row
					label={t("metas.header")}
					sub={draft.header_sub}
					onSub={(value) => set("header_sub", value)}
					hint={t("metas.header_help")}
				>
					{(fieldId) => (
						<TextArea
							id={fieldId}
							rows={4}
							value={draft!.header ?? ""}
							onChange={(event) => set("header", event.target.value)}
						/>
					)}
				</Row>

				<Row
					label={t("metas.readme")}
					sub={draft.r_sub}
					onSub={(value) => set("r_sub", value)}
					hint={t("metas.readme_help")}
				>
					{(fieldId) => (
						<TextArea
							id={fieldId}
							rows={4}
							value={draft!.readme ?? ""}
							onChange={(event) => set("readme", event.target.value)}
						/>
					)}
				</Row>

				{/* The permission lists: kept as fields, with a note about why there is no
				    picker (§12.13 asks for a user multi-select; this deployment has one
				    identity, so the ids are what an imported rule carries). */}
				<div className="rounded-lg bg-neutral-2 px-3 py-2 text-xs leading-relaxed text-neutral-10">
					{t("metas.no_users")}
					<div className="mt-1 flex flex-wrap gap-2">
						<span className="font-medium text-neutral-11">{t("metas.read_users")}:</span>
						<span>{draft.read_users?.join(", ") || t("metas.all_permitted_users")}</span>
						<span className="ml-2 font-medium text-neutral-11">{t("metas.write_users")}:</span>
						<span>{draft.write_users?.join(", ") || t("metas.all_permitted_users")}</span>
					</div>
				</div>
			</Card>

			<div className="mt-4 flex items-center gap-2">
				<ActionButton tone="primary" onPress={() => void save()} isPending={saving}>
					{editing ? t("global.save") : t("metas.add")}
				</ActionButton>
			</div>
		</div>
	);
}

/** A field row with its own "apply to sub folder" checkbox (§12.13). */
function Row({
	label,
	hint,
	sub,
	onSub,
	children,
}: {
	label: string;
	hint?: string;
	sub?: boolean;
	onSub?: (value: boolean) => void;
	children: (fieldId: string) => React.ReactNode;
}) {
	const t = useT();
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-col gap-2 md:flex-row md:items-start">
				<div className="flex-1 md:max-w-[calc(100%-11rem)]">
					<Field label={label} hint={hint}>
						{(fieldId) => children(fieldId)}
					</Field>
				</div>
				{onSub && (
					<Checkbox
						checked={sub ?? false}
						onChange={onSub}
						label={t("metas.apply_sub")}
						labelClassName="text-[11px] text-neutral-10"
						className="md:mt-6 md:shrink-0"
					/>
				)}
			</div>
		</div>
	);
}

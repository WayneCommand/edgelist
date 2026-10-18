import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getStorage, saveStorage } from "../lib/api";
import type { DriverInfo, DriverItem, StorageConfig } from "../lib/types";
import { confirm, notify } from "../lib/feedback";
import { loadWorkspace, useT, useWorkspace } from "../hooks/useStore";
import { ROUTES } from "../routes";
import { ActionButton } from "../ui/ActionButton";
import { Field, Loading, Select, StateMessage, Switch, TextArea, TextInput } from "../ui/Field";
import { Dialog, DialogActions } from "../ui/Dialog";
import { ManageHeading } from "./ManageShell";

/**
 * Storage add/edit (§12.10).
 *
 * The form is **built from the driver registry**, not hard-coded: `/api/admin/driver/list`
 * publishes each driver's common and additional items with their types, defaults,
 * options, required flags and help text, and this renders whatever arrives. That is the
 * same contract the Worker's adapters honour — an item exists only because an adapter
 * reads it — so a driver that gains a field gains a control here with no change to this
 * file.
 *
 * Two fields are special and are handled explicitly:
 *
 * - `addition` is a JSON *string* on the wire, so the additional items are read out of it
 *   and written back into it on save. A malformed value is not a save blocker; the
 *   registry is the source of truth for what a field is, and a broken `addition` simply
 *   means every additional field starts at its default.
 * - switching the driver on an existing storage replaces that half of the form, which
 *   can discard credentials, so it asks first — §12.10 does not say to, but the spec's own
 *   Export/Import pair exists because these fields are hard to retype.
 *
 * Export and Import are §12.10's, and they are the modal pair from §7.1: a read-only
 * multi-line field for the export, a paste field for the import, and the same four
 * stripped keys (`id`, `disabled`, `modified`, `status`) because those are the ones the
 * server assigns itself.
 */
export function StorageFormPage() {
	const t = useT();
	const navigate = useNavigate();
	const { id } = useParams();
	const { drivers } = useWorkspace();
	const editing = Boolean(id);
	const [draft, setDraft] = useState<StorageConfig | null>(null);
	const [loading, setLoading] = useState(editing);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [json, setJson] = useState<"import" | "export" | null>(null);
	const [jsonText, setJsonText] = useState("");

	useEffect(() => {
		if (!editing) {
			setDraft(blankStorage(drivers[0]));
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const loaded = await getStorage(Number(id));
				if (!cancelled) setDraft(loaded);
			} catch (reason) {
				if (!cancelled) setError(reason instanceof Error ? reason.message : t("storages.load_failed"));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [drivers, editing, id, t]);

	// A storage with no driver chosen yet takes the registry's first one, so the form is
	// never empty on a fresh page.
	useEffect(() => {
		if (draft?.driver || !drivers.length) return;
		setDraft({ ...draft!, driver: drivers[0].key as StorageConfig["driver"] });
	}, [draft, drivers]);

	const info = useMemo(
		() => drivers.find((driver) => driver.key === draft?.driver) ?? drivers[0],
		[drivers, draft?.driver],
	);
	const addition = useMemo(() => parseAddition(draft?.addition), [draft?.addition]);

	if (loading) {
		return (
			<div className="flex justify-center py-16">
				<Loading size="lg" />
			</div>
		);
	}

	if (error || !draft) {
		return (
			<StateMessage icon="alert-triangle" tone="danger" title={error || t("storages.load_failed")} className="py-16" />
		);
	}

	function setCommon(name: string, value: unknown) {
		setDraft({ ...draft!, [name]: value });
	}

	function setAdditional(name: string, value: unknown) {
		setDraft({ ...draft!, addition: JSON.stringify({ ...addition, [name]: value }) });
	}

	async function changeDriver(next: string) {
		const target = drivers.find((driver) => driver.key === next);
		if (Object.keys(addition).length > 0) {
			const ok = await confirm({
				title: t("storages.switch_driver_title"),
				message: t("storages.switch_driver_message"),
				confirmLabel: t("storages.switch_driver"),
				danger: true,
			});
			if (!ok) return;
		}
		setDraft({
			...draft!,
			driver: next as StorageConfig["driver"],
			addition: JSON.stringify(defaultsFor(target)),
		});
	}

	async function save() {
		setSaving(true);
		try {
			// `id` decides create against update on the Worker; a fresh storage keeps 0.
			await saveStorage({ ...draft!, id: Number(id) || 0 });
			notify.success(t("storages.saved"));
			await loadWorkspace(true);
			navigate(ROUTES.storages);
		} catch (reason) {
			notify.error(reason);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div>
			<ManageHeading title={`${editing ? t("global.edit") : t("storages.add")}`}>
				<ActionButton tone="soft" icon="arrow-left" size="sm" onPress={() => navigate(ROUTES.storages)}>
					{t("global.back")}
				</ActionButton>
			</ManageHeading>

			<div className="flex flex-col gap-5">
				<section className="flex flex-col gap-3">
					{/* The driver picker is disabled while editing: changing it would silently
					    rewrite every additional field, and the Worker keys a storage's
					    identity off its mount path rather than its driver. */}
					<Field
						label={t("storages.driver")}
						hint={editing ? undefined : t("storages.driver_settings", { driver: info?.name ?? "" })}
					>
						{(fieldId) => (
							<Select
								id={fieldId}
								value={draft.driver}
								disabled={editing}
								onChange={(event) => void changeDriver(event.target.value)}
								className={editing ? "opacity-60" : ""}
							>
								{drivers.map((driver) => (
									<option key={driver.key} value={driver.key}>
										{driver.name}
									</option>
								))}
							</Select>
						)}
					</Field>

					<div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
						{info?.common.map((item) => (
							<ItemField
								key={item.name}
								item={item}
								value={draft[item.name]}
								onChange={(value) => setCommon(item.name, value)}
							/>
						))}
						{info?.additional.map((item) => (
							<ItemField
								key={item.name}
								item={item}
								value={addition[item.name]}
								onChange={(value) => setAdditional(item.name, value)}
								className={item.type === "text" ? "col-span-full" : undefined}
							/>
						))}
					</div>
				</section>

				<div className="flex flex-wrap items-center gap-2">
					<ActionButton tone="primary" onPress={() => void save()} isPending={saving}>
						{editing ? t("global.save") : t("storages.add")}
					</ActionButton>
					<ActionButton
						tone="accent"
						onPress={() => {
							setJsonText(JSON.stringify(stripAssigned(draft), null, 2));
							setJson("export");
						}}
					>
						{t("storages.export")}
					</ActionButton>
					<ActionButton
						tone="soft"
						onPress={() => {
							setJsonText("");
							setJson("import");
						}}
					>
						{t("storages.import")}
					</ActionButton>
				</div>
			</div>

			{json === "export" && (
				<Dialog
					title={t("storages.export_title")}
					size="lg"
					onClose={() => setJson(null)}
					footer={
						<DialogActions
							onCancel={() => setJson(null)}
							onConfirm={() => setJson(null)}
							cancelText={t("global.cancel")}
							confirmLabel={t("global.ok")}
						/>
					}
				>
					<div className="flex flex-col gap-2">
						<p className="text-xs text-neutral-10">{t("storages.export_tips")}</p>
						<TextArea readOnly rows={14} value={jsonText} className="font-mono text-xs" />
					</div>
				</Dialog>
			)}

			{json === "import" && (
				<Dialog
					title={t("storages.import_title")}
					size="lg"
					onClose={() => setJson(null)}
					footer={
						<DialogActions
							onCancel={() => setJson(null)}
							onConfirm={() => {
								try {
									const parsed = JSON.parse(jsonText) as StorageConfig;
									if (!parsed || typeof parsed !== "object")
										throw new Error(t("storages.import_failed", { error: "not an object" }));
									const { id: _id, disabled: _disabled, modified: _modified, status: _status, ...rest } = parsed;
									setDraft({ ...rest, id: 0, disabled: false, status: "work" } as StorageConfig);
									notify.success(t("storages.import_success"));
									setJson(null);
								} catch (reason) {
									notify.error(t("storages.import_failed", { error: reason instanceof Error ? reason.message : "" }));
								}
							}}
							cancelText={t("global.cancel")}
							confirmLabel={t("storages.import")}
						/>
					}
				>
					<div className="flex flex-col gap-2">
						<p className="text-xs text-neutral-10">{t("storages.import_tips")}</p>
						<TextArea
							rows={14}
							value={jsonText}
							onChange={(event) => setJsonText(event.target.value)}
							className="font-mono text-xs"
						/>
					</div>
				</Dialog>
			)}
		</div>
	);
}

/**
 * One registry item, as the control its type names.
 *
 * `secret` wins over `type`: a driver that marks a field secret gets a password input
 * whatever its declared type, which is how the registry keeps a token out of a
 * screenshot without a per-driver rule in the UI.
 */
function ItemField({
	item,
	value,
	onChange,
	className,
}: {
	item: DriverItem;
	value: unknown;
	onChange: (value: unknown) => void;
	className?: string;
}) {
	const label = (
		<span>
			{item.name}
			{item.required && <span className="ml-0.5 text-danger-9">*</span>}
		</span>
	);

	if (item.type === "bool") {
		return (
			<div
				className={`flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2 ${className ?? ""}`}
			>
				<div className="min-w-0">
					<p className="text-[13px] font-medium text-neutral-11">{label}</p>
					{item.help && <p className="mt-0.5 text-xs text-neutral-10">{item.help}</p>}
				</div>
				<Switch checked={value === true || value === "true"} onChange={onChange} />
			</div>
		);
	}

	if (item.type === "select") {
		const options = (item.options ?? "").split(",").filter(Boolean);
		return (
			<Field label={label} hint={item.help} className={className}>
				{(fieldId) => (
					<Select
						id={fieldId}
						value={String(value ?? item.default ?? "")}
						onChange={(event) => onChange(event.target.value)}
					>
						{/* An unset value is a real option for a driver field: the Worker fills
						    in its own default, and "" is how OpenList spells that. */}
						{!item.required && <option value="">-</option>}
						{options.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</Select>
				)}
			</Field>
		);
	}

	if (item.type === "text") {
		return (
			<Field label={label} hint={item.help} className={className}>
				{(fieldId) => (
					<TextArea
						id={fieldId}
						rows={3}
						value={String(value ?? "")}
						onChange={(event) => onChange(event.target.value)}
					/>
				)}
			</Field>
		);
	}

	return (
		<Field label={label} hint={item.help} className={className}>
			{(fieldId) => (
				<TextInput
					id={fieldId}
					type={item.secret ? "password" : item.type === "number" ? "number" : "text"}
					value={String(value ?? "")}
					onChange={(event) => onChange(item.type === "number" ? Number(event.target.value) : event.target.value)}
				/>
			)}
		</Field>
	);
}

/* ------------------------------------------------------------------ helpers */

function blankStorage(driver: DriverInfo | undefined): StorageConfig {
	return {
		id: 0,
		mount_path: "",
		order: 0,
		driver: (driver?.key ?? "webdav") as StorageConfig["driver"],
		status: "work",
		addition: JSON.stringify(defaultsFor(driver)),
		remark: "",
		disabled: false,
	};
}

/** A driver's additional defaults, without its empty values. */
function defaultsFor(driver: DriverInfo | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const item of driver?.additional ?? []) {
		if (!item.default) continue;
		out[item.name] =
			item.type === "bool" ? item.default === "true" : item.type === "number" ? Number(item.default) : item.default;
	}
	return out;
}

function parseAddition(raw: string | undefined): Record<string, unknown> {
	if (!raw) return {};
	try {
		const value = JSON.parse(raw) as unknown;
		return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** The keys the server assigns, which an export is meant to survive without. */
function stripAssigned(storage: StorageConfig): Record<string, unknown> {
	const { id: _id, disabled: _disabled, modified: _modified, status: _status, ...rest } = storage;
	return rest;
}

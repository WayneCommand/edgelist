import { useMemo, useState } from "react";
import { rename as renamePath } from "../lib/api";
import type { FileObject } from "../lib/types";
import { notify } from "../lib/feedback";
import { useT } from "../hooks/useStore";
import { Dialog, DialogActions } from "../ui/Dialog";
import { Field, TextInput } from "../ui/Field";

/**
 * Batch rename (§7.2).
 *
 * Two stages: a configuration dialog, then a preview. The spec splits them into two
 * dialogs with a Back between them, and keeps both because the preview is the whole
 * point — a regex that matches everything is a one-line mistake and a hundred-file
 * rename.
 *
 * Three modes, and the transformation for each is a pure function below so the preview
 * and the submitted names cannot disagree:
 *
 * - **regex** — replace the source pattern in each name with the target string;
 * - **sequential** — the target is a stem and the source is a starting number, with an
 *   optional zero-pad width; `{number}` in the stem is substituted rather than appended;
 * - **find and replace** — first occurrence of a literal string, per name.
 *
 * §18.7: the third mode's description is its own title, verbatim. That is recorded as a
 * quirk to keep, not a bug to fix.
 */
type Mode = "regex" | "sequential" | "replace";

type Plan = { from: FileObject; to: string };

export function BatchRenameDialog({
	items,
	onClose,
	onDone,
}: {
	items: readonly FileObject[];
	onClose: () => void;
	onDone: () => void;
}) {
	const t = useT();
	const [mode, setMode] = useState<Mode>("replace");
	const [source, setSource] = useState("");
	const [target, setTarget] = useState("");
	const [padding, setPadding] = useState("");
	const [plan, setPlan] = useState<Plan[] | null>(null);
	const [pending, setPending] = useState(false);

	const regexError = useMemo(() => {
		if (mode !== "regex" || !source) return "";
		try {
			new RegExp(source);
			return "";
		} catch {
			return t("global.invalid_regex");
		}
	}, [mode, source, t]);

	const disabled = !source.trim() || (mode !== "regex" && !target.trim()) || Boolean(regexError);

	/** The transformation, applied to one name. Pure, so preview and submit share it. */
	function transform(name: string, index: number): string | null {
		if (mode === "regex") {
			try {
				const pattern = new RegExp(source, "g");
				return pattern.test(name) ? name.replace(new RegExp(source, "g"), target) : null;
			} catch {
				return null;
			}
		}
		if (mode === "replace") {
			if (!name.includes(source)) return null;
			// First occurrence only, which is what a "find and replace" of a name means.
			const at = name.indexOf(source);
			return name.slice(0, at) + target + name.slice(at + source.length);
		}
		// Sequential: the target is the stem, the source is the starting number.
		const start = Number(source) || 0;
		const value = String(start + index);
		const width = Math.max(0, Number(padding) || 0);
		const padded = width ? value.padStart(width, "0") : value;
		const stem = target.includes("{number}") ? target.replace("{number}", padded) : `${target}${padded}`;
		// The extension is preserved, because a rename that eats it changes the file's
		// type (§7.2 spells the suffix rule out).
		const dot = name.lastIndexOf(".");
		const suffix = dot > 0 ? name.slice(dot) : "";
		return `${stem}${suffix}`;
	}

	function buildPlan() {
		const next: Plan[] = [];
		items.forEach((item, index) => {
			const name = transform(item.name, index);
			if (name && name !== item.name) next.push({ from: item, to: name });
		});
		setPlan(next);
	}

	async function apply() {
		if (!plan?.length) return;
		setPending(true);
		let done = 0;
		for (const entry of plan) {
			try {
				await renamePath(entry.from.path, entry.to);
				done += 1;
			} catch (reason) {
				notify.error(reason);
			}
		}
		setPending(false);
		if (done) notify.success(t("global.update_success"), `${done}/${plan.length}`);
		onDone();
	}

	// ---- stage two: the preview -------------------------------------------------
	if (plan) {
		return (
			<Dialog
				title={t("toolbar.regex_rename_preview")}
				size="lg"
				onClose={() => setPlan(null)}
				footer={
					<DialogActions
						onCancel={onClose}
						onConfirm={() => void apply()}
						cancelText={t("global.cancel")}
						confirmLabel={t("global.ok")}
						confirmDisabled={plan.length === 0}
						isPending={pending}
					>
						<button
							type="button"
							onClick={() => setPlan(null)}
							className="tap rounded-lg px-3 py-1.5 text-[13px] text-neutral-11 hover:bg-row-hover"
						>
							{t("global.back")}
						</button>
					</DialogActions>
				}
			>
				<div className="flex flex-col gap-1">
					<div className="flex gap-2 px-2 text-xs font-semibold text-neutral-11">
						<span className="flex-1">{t("toolbar.regex_rename_preview_old_name")}</span>
						<span className="flex-1">{t("toolbar.regex_rename_preview_new_name")}</span>
					</div>
					<div className="max-h-80 overflow-y-auto">
						{plan.length === 0 ? (
							<p className="p-6 text-center text-sm text-neutral-10">{t("toolbar.transfer_none")}</p>
						) : (
							plan.map((entry) => (
								<div key={entry.from.path} className="flex gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-row-hover">
									<span className="min-w-0 flex-1 truncate text-neutral-10" title={entry.from.name}>
										{entry.from.name}
									</span>
									<span className="min-w-0 flex-1 truncate font-medium" title={entry.to}>
										{entry.to}
									</span>
								</div>
							))
						)}
					</div>
				</div>
			</Dialog>
		);
	}

	// ---- stage one: the configuration -------------------------------------------
	const description =
		mode === "regex"
			? t("toolbar.regular_rename")
			: mode === "sequential"
				? t("toolbar.sequential_renaming_desc")
				: t("toolbar.find_replace_desc");

	return (
		<Dialog
			title={t("toolbar.batch_rename")}
			size="md"
			onClose={onClose}
			footer={
				<DialogActions
					onCancel={onClose}
					onConfirm={buildPlan}
					cancelText={t("global.cancel")}
					confirmLabel={t("global.ok")}
					confirmDisabled={disabled}
				/>
			}
		>
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap gap-4">
					{(
						[
							["regex", "toolbar.regex_rename"],
							["sequential", "toolbar.sequential_renaming"],
							["replace", "toolbar.find_replace"],
						] as const
					).map(([value, label]) => (
						<label key={value} className="flex cursor-pointer items-center gap-1.5 text-sm">
							<input
								type="radio"
								name="batch-mode"
								checked={mode === value}
								onChange={() => {
									setMode(value);
									setSource("");
									setTarget("");
								}}
								className="accent-info-9"
							/>
							{t(label)}
						</label>
					))}
				</div>

				<p className="text-xs leading-relaxed text-neutral-10">{description}</p>

				<Field
					label={mode === "regex" ? "Regex" : mode === "sequential" ? "Start value" : t("toolbar.find_replace")}
					error={regexError}
				>
					{(id) => <TextInput id={id} value={source} onChange={(event) => setSource(event.target.value)} />}
				</Field>

				<Field label={mode === "regex" ? "Replacement" : mode === "sequential" ? "New name" : "Replace with"}>
					{(id) => <TextInput id={id} value={target} onChange={(event) => setTarget(event.target.value)} />}
				</Field>

				{mode === "sequential" && (
					<Field label={t("toolbar.sequential_renaming_input3_placeholder")}>
						{(id) => (
							<TextInput
								id={id}
								type="number"
								min={0}
								value={padding}
								onChange={(event) => setPadding(event.target.value)}
								placeholder="2"
							/>
						)}
					</Field>
				)}

				<p className="text-[11px] text-neutral-10">
					{items.length} {t("home.obj.name").toLowerCase()}
				</p>
			</div>
		</Dialog>
	);
}

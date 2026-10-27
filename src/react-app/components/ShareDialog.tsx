import { useEffect, useState } from "react";
import { createShare, updateShare, type ShareState, type ShareView } from "../lib/api";
import { notify } from "../lib/feedback";
import { useT } from "../hooks/useStore";
import { ActionButton } from "../ui/ActionButton";
import { Dialog, DialogActions } from "../ui/Dialog";
import { Chip, Field, Loading, Switch, TextArea, TextInput } from "../ui/Field";

/**
 * The share dialog (§7.8), for one path.
 *
 * One component serves both entry points — the file browser's menu and the file
 * page's header — because a share is a property of a path, not of whichever
 * screen you happened to be looking at. It is opened with the state it already
 * has, so "share" and "edit this share" are the same dialog rather than two.
 *
 * The link is *not* shown after creating and forgotten: the panel keeps it, with
 * a copy button, because the only thing a person wants after making a file public
 * is the URL. §7.8 puts the result in a read-only textarea and calls the affordance
 * "Copy link"; this follows that shape but keeps the settings visible above it,
 * since changing the expiry is the next thing anyone does.
 */
export function ShareDialog({
	path,
	name,
	state,
	onClose,
	onChanged,
}: {
	path: string;
	name: string;
	/** The current share, or null when the path is private. */
	state: ShareState | null;
	onClose: () => void;
	onChanged?: () => void;
}) {
	const t = useT();
	const existing = state?.share ?? null;
	const [draft, setDraft] = useState({
		code: "",
		expires: toLocalInput(existing?.expires ?? ""),
		max_views: existing?.max_views ?? 0,
		remark: existing?.remark ?? "",
	});
	const [enabled, setEnabled] = useState(existing?.enabled ?? true);
	const [share, setShare] = useState<ShareView | null>(existing);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);

	// A dialog opened from a row that only knows its path still has to learn
	// whether that path is already shared. The caller may pass `null` to mean
	// "ask the server", which is the common case from a context menu.
	useEffect(() => {
		if (state !== null) {
			setLoading(false);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const { shareStateOf } = await import("../lib/api");
				const found = await shareStateOf(path);
				if (cancelled) return;
				if (found.share) {
					setShare(found.share);
					setDraft({
						code: "",
						expires: toLocalInput(found.share.expires),
						max_views: found.share.max_views,
						remark: found.share.remark,
					});
					setEnabled(found.share.enabled);
				}
			} catch (reason) {
				if (!cancelled) setError(reason instanceof Error ? reason.message : t("share.load_failed"));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [path, state, t]);

	async function submit() {
		setPending(true);
		setError("");
		try {
			const saved = share
				? await updateShare({
						path,
						enabled,
						code: draft.code || undefined,
						expires: fromLocalInput(draft.expires),
						max_views: draft.max_views,
						remark: draft.remark,
					})
				: await createShare({
						path,
						code: draft.code || undefined,
						expires: fromLocalInput(draft.expires),
						max_views: draft.max_views,
						remark: draft.remark,
					});
			setShare(saved);
			notify.success(share ? t("share.updated") : t("share.created"));
			onChanged?.();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : t("share.save_failed"));
			notify.error(reason);
		} finally {
			setPending(false);
		}
	}

	async function copyValue(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			notify.success(t("global.copied"));
		} catch {
			notify.error(t("global.clipboard_denied"));
		}
	}

	return (
		<Dialog
			title={share ? t("share.title_edit") : t("share.title_new")}
			size="lg"
			onClose={onClose}
			footer={
				<DialogActions
					onCancel={onClose}
					onConfirm={() => void submit()}
					confirmLabel={share ? t("global.save") : t("share.create")}
					confirmTone="primary"
					cancelText={t("global.cancel")}
					isPending={pending}
					confirmDisabled={loading}
				/>
			}
		>
			{loading ? (
				<div className="flex justify-center py-10">
					<Loading size="lg" />
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{/* The name is the last segment of the path, so printing both
					    reads "token.md/token.md" — the full path is only shown
					    when it adds something. */}
					<p className="text-[13px] text-neutral-11">
						<span className="font-medium text-foreground">{name}</span>
						{path.replace(/\/$/, "") !== `/${name}` && <span className="ml-1 break-all text-neutral-10">{path}</span>}
					</p>

					{share && (
						<div className="rounded-lg border border-hairline bg-neutral-2 px-3 py-2">
							{/* Two links, because they answer two different questions.
							    The download is what the owner is asked for — a URL that
							    opens the file, in a browser or in another app. The page
							    is the human-readable wrapper around it. Printing only one
							    of them makes the other unguessable. */}
							<LinkRow
								label={t("share.raw_link")}
								value={share.raw_url}
								hint={t("share.raw_link_help")}
								onCopy={() => void copyValue(share.raw_url)}
								copyLabel={t("share.copy_link")}
							/>
							<div className="mt-2 border-t border-hairline pt-2">
								<LinkRow
									label={t("share.link")}
									value={share.url}
									hint={t("share.link_help")}
									onCopy={() => void copyValue(share.url)}
									copyLabel={t("global.copy")}
								/>
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[11px] text-neutral-10">
								<span>
									{t("share.storage")}: <span className="text-neutral-11">{share.storage.name}</span>
									{share.storage.name !== share.storage.mount_path && (
										<span className="ml-1 font-mono">{share.storage.mount_path}</span>
									)}
								</span>
								<Chip tone={stateTone(share, state?.state)}>
									{t(`share.state.${stateOf(share, state?.state)}` as "share.state.work")}
								</Chip>
								<span>
									{share.views}
									{share.max_views > 0 ? ` / ${share.max_views}` : ""} {t("share.views")}
								</span>
								{share.code_required && <Chip tone="warning">{t("share.code_on")}</Chip>}
							</div>
						</div>
					)}

					{share && (
						<label className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2">
							<span className="text-[13px]">{t("share.enabled")}</span>
							<Switch checked={enabled} aria-label={t("share.enabled")} onChange={setEnabled} />
						</label>
					)}

					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={t("share.code")} hint={t("share.code_help")}>
							{(fieldId) => (
								<TextInput
									id={fieldId}
									type="password"
									value={draft.code}
									placeholder={share?.code_required ? "••••••" : ""}
									onChange={(event) => setDraft({ ...draft, code: event.target.value })}
								/>
							)}
						</Field>
						<Field label={t("share.expires")} hint={t("share.expires_help")}>
							{(fieldId) => (
								<TextInput
									id={fieldId}
									type="datetime-local"
									value={draft.expires}
									onChange={(event) => setDraft({ ...draft, expires: event.target.value })}
								/>
							)}
						</Field>
						<Field label={t("share.max_views")} hint={t("share.max_views_help")}>
							{(fieldId) => (
								<TextInput
									id={fieldId}
									type="number"
									min={0}
									value={String(draft.max_views)}
									onChange={(event) => setDraft({ ...draft, max_views: Math.max(0, Number(event.target.value) || 0) })}
								/>
							)}
						</Field>
					</div>

					<Field label={t("share.remark")}>
						{(fieldId) => (
							<TextArea
								id={fieldId}
								rows={2}
								value={draft.remark}
								onChange={(event) => setDraft({ ...draft, remark: event.target.value })}
							/>
						)}
					</Field>

					{error && <p className="text-[12px] text-danger-11">{error}</p>}
				</div>
			)}
		</Dialog>
	);
}

/**
 * What the badge says: the share's own state, not just whether it is switched on.
 *
 * A link that is enabled but out of downloads is not "Working", and saying so was
 * the one lie this panel told. The record's live state comes from the server, which
 * is the only place that knows today's date.
 */
function stateOf(share: ShareView, reported?: string): "work" | "disabled" | "expired" | "exhausted" {
	if (reported === "expired" || reported === "exhausted" || reported === "disabled") return reported;
	if (!share.enabled) return "disabled";
	if (share.max_views > 0 && share.views >= share.max_views) return "exhausted";
	if (share.expires && Date.parse(share.expires) <= Date.now()) return "expired";
	return "work";
}

function stateTone(share: ShareView, reported?: string): "success" | "danger" | "neutral" | "warning" {
	const state = stateOf(share, reported);
	return state === "work" ? "success" : state === "disabled" ? "neutral" : "danger";
}

/**
 * `datetime-local` wants `YYYY-MM-DDTHH:mm` in the *local* zone; the Worker
 * stores an ISO instant. Both conversions live here so a timezone never leaks
 * into the stored value.
 */
function toLocalInput(iso: string): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** One labelled URL with its own copy button and a line saying what it is for. */
function LinkRow({
	label,
	value,
	hint,
	onCopy,
	copyLabel,
}: {
	label: string;
	value: string;
	hint: string;
	onCopy: () => void;
	copyLabel: string;
}) {
	return (
		<div>
			<div className="mb-1 text-[11px] font-semibold tracking-[0.04em] text-neutral-10 uppercase">{label}</div>
			<div className="flex items-center gap-2">
				<code className="min-w-0 flex-1 truncate font-mono text-[12px] text-info-11">{value}</code>
				<ActionButton tone="soft" size="sm" icon="copy" onPress={onCopy}>
					{copyLabel}
				</ActionButton>
			</div>
			<p className="mt-1 text-[11px] leading-snug text-neutral-10">{hint}</p>
		</div>
	);
}

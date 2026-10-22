import { useCallback, useEffect, useState } from "react";
import { deletePasskey, listPasskeys, passkeyRegisterOptions, registerPasskey, type PasskeySummary } from "../lib/api";
import { confirm, notify } from "../lib/feedback";
import { formatDate } from "../lib/format";
import { createPasskey, passkeysAvailable, passkeysSecure, PasskeyClientError } from "../lib/passkey";
import { useT, useWorkspace } from "../hooks/useStore";
import type { Translate } from "../hooks/useStore";
import { ActionButton } from "../ui/ActionButton";
import { Chip, Field, Loading, TextInput } from "../ui/Field";
import { ManageHeading } from "./ManageShell";
import { Card } from "../ui/PageShell";

/**
 * Profile (§12.5, cut to what this deployment can do).
 *
 * The spec's page changes a username and a password, lists WebAuthn
 * credentials, manages SSH keys and shows sixteen permission badges. This Worker
 * authenticates **one AK/SK pair read from KV** (`auth.ts`), so there is no user
 * record to update and no second identity to manage — but a passkey is a second
 * *way to prove* that one identity, which is why the credential list below is
 * real rather than decorative.
 *
 * The identity itself stays read-only: the access key is the deployment's
 * configuration, and editing it from a page authenticated by it would be a way
 * to lock the deployment out of itself.
 */
export function ProfilePage() {
	const t = useT();
	const { me } = useWorkspace();
	const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState<string | null>(null);
	const supported = passkeysAvailable();
	const secure = passkeysSecure();

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const page = await listPasskeys();
			setPasskeys(page.content ?? []);
		} catch (reason) {
			notify.error(reason);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function addPasskey() {
		setBusy("add");
		try {
			const { challenge_id, options } = await passkeyRegisterOptions();
			const credential = await createPasskey(options);
			await registerPasskey(challenge_id, credential);
			notify.success(t("manage.passkey.added"));
			await refresh();
		} catch (reason) {
			notify.error(passkeyMessage(reason, t));
		} finally {
			setBusy(null);
		}
	}

	async function removePasskey(passkey: PasskeySummary) {
		const ok = await confirm({
			title: t("global.delete"),
			message: t("manage.passkey.remove_confirm", { name: passkey.name }),
			confirmLabel: t("global.confirm"),
			danger: true,
		});
		if (!ok) return;
		setBusy(passkey.id);
		try {
			await deletePasskey(passkey.id);
			notify.success(t("manage.passkey.removed"));
			await refresh();
		} catch (reason) {
			notify.error(reason);
		} finally {
			setBusy(null);
		}
	}

	return (
		<div>
			<ManageHeading title={t("manage.profile.title")} description={t("manage.profile.description")} />

			<div className="flex max-w-xl flex-col gap-4">
				<Card className="flex flex-col gap-3 p-4">
					<div className="flex items-center gap-2">
						<Chip tone="accent">{me?.is_admin ? "admin" : "guest"}</Chip>
						<span className="text-[13px] text-neutral-11">{t("manage.signed_in_as")}</span>
						<span className="text-[13px] font-semibold">{me?.username ?? "—"}</span>
					</div>

					<Field label={t("manage.profile.username")} hint={t("manage.profile.managed_in_kv")}>
						{(fieldId) => <TextInput id={fieldId} readOnly value={me?.username ?? ""} className="opacity-70" />}
					</Field>
				</Card>

				<Card className="flex flex-col gap-3 p-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-[12px] font-semibold tracking-[0.04em] text-neutral-10 uppercase">
								{t("manage.passkey.title")}
							</p>
							<p className="mt-1 text-[12px] leading-relaxed text-neutral-10">{t("manage.passkey.description")}</p>
						</div>
						<ActionButton
							tone="accent"
							size="sm"
							icon="key"
							isPending={busy === "add"}
							isDisabled={!supported || !secure}
							onPress={() => void addPasskey()}
						>
							{t("manage.passkey.add")}
						</ActionButton>
					</div>

					{(!supported || !secure) && (
						<p className="rounded-lg bg-warning-3 px-3 py-2 text-[12px] text-warning-11">
							{supported ? t("login.passkey_insecure") : t("manage.passkey.unsupported")}
						</p>
					)}

					{loading ? (
						<div className="flex justify-center py-6">
							<Loading size="lg" />
						</div>
					) : passkeys.length === 0 ? (
						<p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-[12.5px] text-neutral-10">
							{t("manage.passkey.empty")}
						</p>
					) : (
						<div className="divide-y divide-hairline">
							{passkeys.map((passkey) => (
								<div key={passkey.id} className="flex items-center justify-between gap-3 py-2.5">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="truncate text-[13px] font-medium">{passkey.name}</span>
											{passkey.backed_up && <Chip tone="success">{t("manage.passkey.synced")}</Chip>}
										</div>
										<div className="mt-0.5 text-[11px] text-neutral-10">
											{t("manage.passkey.created", { date: formatDate(passkey.created_at) })}
											{passkey.last_used_at
												? ` · ${t("manage.passkey.last_used", { date: formatDate(passkey.last_used_at) })}`
												: ""}
										</div>
									</div>
									<ActionButton
										tone="ghost"
										size="sm"
										icon="trash"
										iconOnly
										isPending={busy === passkey.id}
										aria-label={t("global.delete")}
										className="text-danger-11"
										onPress={() => void removePasskey(passkey)}
									/>
								</div>
							))}
						</div>
					)}
				</Card>

				<div className="rounded-xl border border-warning-6/40 bg-warning-3 px-3.5 py-3 text-[12.5px] leading-relaxed text-warning-11">
					{t("manage.users.permissions")}
				</div>

				<Card className="p-4">
					<p className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-neutral-10 uppercase">
						{t("manage.profile.permissions")}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{PERMISSIONS.map((permission) => (
							<Chip key={permission} tone="success">
								{permission}
							</Chip>
						))}
					</div>
				</Card>
			</div>
		</div>
	);
}

/** The passkey failures a person can act on, in their own words. */
function passkeyMessage(reason: unknown, t: Translate): string {
	if (reason instanceof PasskeyClientError) {
		if (reason.code === "unsupported") return t("login.passkey_unsupported");
		if (reason.code === "insecure") return t("login.passkey_insecure");
		if (reason.code === "cancelled") return t("manage.passkey.cancelled");
		return t("manage.passkey.failed");
	}
	if (reason instanceof Error) return reason.message;
	return t("manage.passkey.failed");
}

/**
 * §6.1's sixteen permission bits, in order.
 *
 * The names are the spec's own list, and this deployment grants all of them — which is
 * what the badges above say. They are stated rather than derived because the Worker does
 * not serialise a permission mask: it hard-codes `{ id: 0, permission: 3 }` per request,
 * so a client cannot compute the set from a number it is never given.
 */
const PERMISSIONS = [
	"see_hides",
	"access_without_password",
	"offline_download",
	"write_content",
	"rename",
	"move",
	"copy",
	"delete",
	"webdav_read",
	"webdav_manage",
	"ftp_read",
	"ftp_manage",
	"read_archives",
	"decompress",
	"share",
	"customize_share_id",
];

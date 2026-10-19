import { useT, useWorkspace } from "../hooks/useStore";
import { Chip, Field, TextInput } from "../ui/Field";
import { ManageHeading } from "./ManageShell";
import { Card } from "../ui/PageShell";

/**
 * Profile (§12.5, cut to what this deployment can do).
 *
 * The spec's page changes a username and a password, lists WebAuthn credentials, manages
 * SSH keys and shows sixteen permission badges. None of that is possible here, and the
 * reason is architectural rather than unfinished: this Worker authenticates **one AK/SK
 * pair read from KV** (`auth.ts`), so there is no user record to update, no second
 * identity to list, and no credential store to register against. Every request runs as
 * the same principal with every permission.
 *
 * So the page shows what is true — the identity the token carries, and the fact that the
 * credentials live in KV — rather than a form whose Save button would be a lie. The
 * spec's own read-only case is the guest view, which is the same shape: a note saying why
 * nothing here can be changed.
 */
export function ProfilePage() {
	const t = useT();
	const { me } = useWorkspace();

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

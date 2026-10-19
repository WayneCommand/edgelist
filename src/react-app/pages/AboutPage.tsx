import { useT, useWorkspace } from "../hooks/useStore";
import { Chip } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { ManageHeading } from "./ManageShell";
import { Card } from "../ui/PageShell";
import { LogoMark } from "../ui/Chrome";

/**
 * About (§12.22, adapted).
 *
 * The spec renders a remote README. That is a marketing page for OpenList, and this is
 * not OpenList — so the page answers the question a reader of an About page actually has:
 * what this deployment is, what it is built on, what it can do, and what it deliberately
 * does not do.
 *
 * The "does not do" list is the important half. Every omission in this interface has a
 * reason that belongs somewhere a user can find it, and this is that place: no shares, no
 * task queue, no index, no user directory, no archive or Office previewer. A reader who
 * goes looking for the Shares menu should be able to learn here that it is not missing by
 * accident.
 */
export function AboutPage() {
	const t = useT();
	const { storages, drivers, mounts } = useWorkspace();

	return (
		<div>
			<ManageHeading title={t("about.title")} />

			<div className="flex max-w-2xl flex-col gap-4">
				<Card className="flex flex-col gap-4 p-5">
					<div className="flex items-start gap-3">
						<LogoMark size="lg" />
						<div>
							<h2 className="text-[16px] font-semibold tracking-tight">EdgeList</h2>
							<p className="text-[12.5px] text-neutral-10">{t("about.tagline")}</p>
						</div>
					</div>

					<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t border-hairline pt-4 text-[12.5px]">
						<Term>{t("about.backend")}</Term>
						<Value>{t("about.backend_value")}</Value>
						<Term>{t("about.auth")}</Term>
						<Value>{t("about.auth_value")}</Value>
						<Term>{t("about.api")}</Term>
						<Value>{t("about.api_value")}</Value>
						<Term>{t("about.drivers")}</Term>
						<Value>
							<div className="flex flex-wrap gap-1">
								{(drivers.length
									? drivers
									: [
											{ key: "object", name: "S3" },
											{ key: "webdav", name: "WebDav" },
											{ key: "openlist", name: "OpenList" },
										]
								).map((driver) => (
									<Chip key={driver.key} tone="info">
										{driver.name}
									</Chip>
								))}
							</div>
						</Value>
						<Term>{t("storages.title")}</Term>
						<Value>
							{storages.length} · {mounts.join(", ") || "/"}
						</Value>
					</dl>
				</Card>

				<Card className="p-5">
					<h3 className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-neutral-10 uppercase">
						Not implemented
					</h3>
					<ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-neutral-10">
						{LIMITS.map((limit) => (
							<li key={limit.title} className="flex gap-1.5">
								<Icon name="minus" className="mt-1 size-3 shrink-0 text-neutral-8" />
								<span>
									<span className="font-medium text-neutral-11">{limit.title}</span> — {limit.reason}
								</span>
							</li>
						))}
					</ul>
				</Card>

				<p className="px-1 text-[11.5px] leading-relaxed text-neutral-10">
					The interface follows <code className="rounded bg-neutral-3 px-1">interfaces.md</code>, a transcription of
					OpenList's front end. Where this deployment cannot match it, the deviation is stated above rather than drawn
					and left inert.
				</p>
			</div>
		</div>
	);
}

function Term({ children }: { children: React.ReactNode }) {
	return <dt className="text-neutral-10">{children}</dt>;
}

function Value({ children }: { children: React.ReactNode }) {
	return <dd className="min-w-0 break-words">{children}</dd>;
}

/**
 * What this deployment does not do, and why.
 *
 * Each entry names the Worker surface that is missing, not the UI that would draw it: a
 * menu item is not the feature, and saying "no Shares page" would imply the rest exists.
 */
const LIMITS = [
	{
		title: "Shares",
		reason: "no share records, no public `/s/*` route, and no per-share permissions — every read is authenticated",
	},
	{
		title: "Offline downloads and a task queue",
		reason: "a Worker has no scheduler or background process to run one in",
	},
	{
		title: "Search index",
		reason: "search is a bounded live scan of the tree, not an index; `/api/fs/search` caps depth and directory count",
	},
	{
		title: "User directory, roles and 2FA",
		reason:
			"authentication is one access-key/secret-key pair held in KV, so there is one principal and one permission set",
	},
	{
		title: "Archive and Office previewers",
		reason:
			"they need a decompressor for seven formats and a document converter; both would be larger than this front end",
	},
	{
		title: "Plugins, themes and a messenger",
		reason: "the Worker loads no third-party code, by design",
	},
	{
		title: "S3 settings page",
		reason: "S3 is a storage driver here, configured per mount with the other drivers rather than as a server setting",
	},
];

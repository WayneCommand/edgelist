import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { ApiError } from "../lib/api";
import { formatDate, formatSize } from "../lib/format";
import { useT } from "../hooks/useStore";
import { ActionButton } from "../ui/ActionButton";
import { Loading, StateMessage, TextInput } from "../ui/Field";

/**
 * A public share (§§3.2, 5.2) — the page `/s/<path>` opens for a visitor.
 *
 * It deliberately renders *without* the app's chrome, without a session and
 * without an api token: a person who was handed a link is not a user, and asking
 * them to sign in would defeat the share. The only fetch it makes is to
 * `/api/s/<path>`, which is unauthenticated for the same reason.
 *
 * The address is the file's own path, so the page keeps the shape of the thing
 * being shared: `/s/waynecos/token.md`. The download is the same path with
 * `/download` appended.
 *
 * The download is a plain anchor, not a blob built from a fetched body. That is
 * the one place in this app where a bare link is correct: the route is public, so
 * the browser can stream it directly, and a large file never has to pass through
 * a JavaScript `Blob`.
 */
type SharePageData = {
	path: string;
	name: string;
	url: string;
	raw_url: string;
	storage: { id: number; name: string; mount_path: string };
	remark: string;
	code_required: boolean;
	expires: string;
	views: number;
	max_views: number;
	enabled: boolean;
	header?: string;
	readme?: string;
	size?: number;
	is_dir?: boolean;
};

export function SharePage() {
	const t = useT();
	const { pathname } = useLocation();
	const sharePath = sharePathOf(pathname);
	const apiUrl = `/api/s/${encodePath(sharePath)}`;
	const [data, setData] = useState<SharePageData | null>(null);
	const [error, setError] = useState("");
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(true);
	// A code-protected share answers 401 to the first ask; the page shows the code
	// field instead of an error, because that is the expected next step.
	const [needsCode, setNeedsCode] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setPending(true);
		setError("");
		void (async () => {
			try {
				const response = await fetch(`${apiUrl}${code ? `?code=${encodeURIComponent(code)}` : ""}`);
				const body = (await response.json()) as { code: number; message: string; data: SharePageData };
				if (cancelled) return;
				if (response.status === 401) {
					setNeedsCode(true);
					if (code) setError(t("share.page_code"));
					return;
				}
				if (!response.ok || body.code !== 200) {
					setError(body.message || t("share.page_missing"));
					return;
				}
				setData(body.data);
				setNeedsCode(false);
			} catch (reason) {
				if (!cancelled) setError(reason instanceof ApiError ? reason.message : t("share.page_missing"));
			} finally {
				if (!cancelled) setPending(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [apiUrl, code, t]);

	if (pending && !data) {
		return (
			<div className="flex min-h-dvh items-center justify-center">
				<Loading size="lg" />
			</div>
		);
	}

	if (error && !needsCode) {
		return (
			<div className="flex min-h-dvh items-center justify-center px-4">
				<StateMessage icon="alert-triangle" tone="danger" title={error} className="max-w-sm" />
			</div>
		);
	}

	if (needsCode && !data) {
		return (
			<div className="flex min-h-dvh items-center justify-center px-4">
				<form
					className="glass-panel flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-hairline p-5 shadow-lg"
					onSubmit={(event) => {
						event.preventDefault();
						setCode((value) => value);
						// Re-run the fetch with the code; `setCode` alone would not, because
						// the value may be unchanged on a retry.
						setPending(true);
						setError("");
						void (async () => {
							const response = await fetch(`${apiUrl}?code=${encodeURIComponent(code)}`);
							const body = (await response.json()) as { code: number; message: string; data: SharePageData };
							if (response.ok && body.code === 200) {
								setData(body.data);
								setNeedsCode(false);
							} else {
								setError(body.message || t("share.page_code"));
							}
							setPending(false);
						})();
					}}
				>
					<h1 className="text-base font-semibold">{t("share.page_code")}</h1>
					<TextInput
						type="password"
						value={code}
						autoFocus
						onChange={(event) => setCode(event.target.value)}
						aria-label={t("share.page_code")}
					/>
					{error && <p className="text-[12px] text-danger-11">{error}</p>}
					<ActionButton tone="primary" type="submit" isPending={pending}>
						{t("share.page_unlock")}
					</ActionButton>
				</form>
			</div>
		);
	}

	if (!data) return null;

	const remaining = data.max_views > 0 ? Math.max(0, data.max_views - data.views) : null;

	return (
		<div className="flex min-h-dvh items-center justify-center px-4 py-10">
			<div className="glass-panel flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-hairline p-6 shadow-lg">
				<div>
					<div className="text-[11px] font-semibold tracking-[0.04em] text-neutral-10 uppercase">
						{t("share.page_title")}
					</div>
					<h1 className="mt-1 text-lg font-semibold break-all">{data.name}</h1>
					{data.remark && <p className="mt-1 text-[13px] text-neutral-11">{data.remark}</p>}
				</div>

				<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
					<div>
						<dt className="text-neutral-10">{t("home.obj.size")}</dt>
						<dd className="text-neutral-11 tabular-nums">{formatSize(data.size)}</dd>
					</div>
					<div>
						<dt className="text-neutral-10">{t("share.storage")}</dt>
						<dd className="text-neutral-11">{data.storage.name}</dd>
					</div>
					<div>
						<dt className="text-neutral-10">{t("share.expires")}</dt>
						<dd className="text-neutral-11">{data.expires ? formatDate(data.expires) : "-"}</dd>
					</div>
					<div>
						<dt className="text-neutral-10">{t("share.views")}</dt>
						<dd className="text-neutral-11 tabular-nums">
							{data.views}
							{data.max_views > 0 ? ` / ${data.max_views}` : ""}
						</dd>
					</div>
					{remaining !== null && (
						<div>
							<dt className="text-neutral-10">&nbsp;</dt>
							<dd className="text-neutral-10">{t("share.page_views_left", { count: remaining })}</dd>
						</div>
					)}
				</dl>

				{/* A plain anchor, not a fetched blob: the route is public, so the
				    browser can stream straight from it. */}
				<a
					href={`${data.raw_url}${code ? `?code=${encodeURIComponent(code)}` : ""}`}
					className="tap inline-flex items-center justify-center gap-2 rounded-lg bg-info-9 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-info-10"
				>
					{t("share.page_download")}
				</a>
			</div>
		</div>
	);
}

/** The virtual path inside a `/s/...` location, decoded once. */
function sharePathOf(pathname: string): string {
	let decoded = pathname;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		/* a stray `%` is a path, not an escape */
	}
	const rest = decoded.replace(/^\/s\/?/, "");
	return `/${rest.replace(/^\/+|\/+$/g, "")}`;
}

/** Each segment on its own, so the slashes stay slashes. */
function encodePath(path: string): string {
	return path
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

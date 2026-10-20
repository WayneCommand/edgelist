import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { getFile } from "../lib/api";
import { formatDate, kindOf, mimeFor } from "../lib/format";
import { parentOf, pathToUrl } from "../lib/paths";
import { useT } from "../hooks/useStore";
import { ROUTES } from "../routes";
import type { FileObject } from "../lib/types";
import { ActionButton } from "../ui/ActionButton";
import { Loading, StateMessage } from "../ui/Field";
import { ImageViewer, picturesIn } from "../components/preview/ImageViewer";
import { MarkdownViewer } from "../components/preview/MarkdownViewer";
import { DownloadPanel, HtmlViewer, MediaViewer } from "../components/preview/MediaViewer";
import { PageShell } from "../ui/PageShell";
import { Icon } from "../ui/Icon";
import { TextEditor } from "../components/preview/TextEditor";
import { ShareDialog } from "../components/ShareDialog";
import { useFileContents, ViewerFrame } from "../components/preview/ViewerFrame";

/**
 * A single file's page (§5).
 *
 * The file is reached at its own virtual path rather than under a route prefix —
 * OpenList keeps files and directories in one namespace, and the spec's route table
 * has no `/file/` — so the page decides what it is by asking `/api/fs/get`. A
 * directory path never lands here: the browser opens those itself.
 *
 * The previewer is chosen by extension (§5.1), with `?preview=` able to override it.
 * Three of the spec's twenty previewers have no implementation here and are listed
 * as such rather than faked:
 *
 * - **archive** — it needs a decompressor for seven formats, and the Worker exposes
 *   no archive listing to drive it;
 * - **office** — it needs a converter this app does not ship, and the browser has
 *   none of its own (§5.11 says the same thing);
 * - **flash / ipa / plist / torrent / asciinema / video360** — third-party players or
 *   platform installers.
 *
 * Those files land on the download panel, which is the honest answer: §5.2 is
 * explicitly the page for "no previewer at all".
 */
export type PreviewKey = "download" | "image" | "video" | "audio" | "pdf" | "markdown" | "text_editor" | "html";

export function FilePage() {
	const params = useParams();
	const [search] = useSearchParams();
	const navigate = useNavigate();
	const t = useT();
	// `params["*"]` is everything after the route, which for the catch-all is the
	// decoded virtual path.
	const path = `/${params["*"] ?? ""}`;
	const [item, setItem] = useState<FileObject | null>(null);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(true);
	// The pictures in the same directory, so the lightbox can step through them
	// (§5.3). Loaded lazily, only once an image is actually being shown.
	const [siblings, setSiblings] = useState<FileObject[]>([]);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setPending(true);
		setError("");
		(async () => {
			try {
				const file = await getFile(path);
				if (cancelled) return;
				setItem(file);
			} catch (reason) {
				if (!cancelled) setError(reason instanceof Error ? reason.message : t("home.load_failed"));
			} finally {
				if (!cancelled) setPending(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [path, t]);

	const kind = item ? kindOf(item.name) : "binary";
	const previewers = item ? previewersFor(item, kind) : [];
	const requested = search.get("preview") as PreviewKey | null;
	const active = requested && previewers.some((entry) => entry.key === requested) ? requested : previewers[0]?.key;

	// The sibling list is only needed by the image viewer, and only its picture
	// entries, so it is fetched when that viewer is the one showing.
	const needsGallery = active === "image";
	useEffect(() => {
		if (!needsGallery || !item) return;
		let cancelled = false;
		void (async () => {
			try {
				const { listFiles } = await import("../lib/api");
				const page = await listFiles(parentOf(item.path));
				if (!cancelled) setSiblings(picturesIn(page.content));
			} catch {
				if (!cancelled) setSiblings([item]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [needsGallery, item]);

	const onBackWithGuard = useBackGuard(dirty, ROUTES.files(parentOf(path)));

	const selectPreview = useCallback(
		(key: PreviewKey) => {
			// `replace` on purpose: §5 has switching a previewer write the URL without
			// adding a history entry, so Back leaves the file rather than stepping
			// through six renderers of it.
			const next = new URLSearchParams(search);
			next.set("preview", key);
			navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
		},
		[navigate, search],
	);

	if (pending) {
		/* The bar and the body are both placeholders: a file page is a title, a
		   switcher and a viewer, and drawing their shapes costs nothing while the
		   `fs/get` is in flight — while a spinner in the middle would move
		   everything down the moment the real bar appears. */
		return (
			<PageShell className="min-h-dvh">
				<div role="status" aria-label={t("global.loading")} className="flex items-center gap-2 py-2">
					<div className="skeleton h-5 w-16 rounded-md" />
					<div className="skeleton h-4 w-32 rounded-full" />
				</div>
				<div className="mb-3 flex gap-1.5" aria-hidden="true">
					<div className="skeleton h-7 w-24 rounded-md" />
					<div className="skeleton h-7 w-28 rounded-md" />
				</div>
				<div className="glass-panel flex min-h-[45vh] items-center justify-center rounded-2xl border border-hairline shadow-sm">
					<Loading size="lg" />
				</div>
			</PageShell>
		);
	}

	if (error || !item) {
		return (
			<PageShell>
				<StateMessage
					icon="alert-triangle"
					tone="danger"
					title={error || t("home.load_failed")}
					description={path}
					action={
						<ActionButton tone="soft" onPress={() => navigate(ROUTES.files(parentOf(path)))}>
							{t("global.back")}
						</ActionButton>
					}
					className="min-h-[50vh] justify-center"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell className="min-h-dvh">
			{/* §5: a file page had no chrome at all, so the only way back was the
			    browser's own button. One bar: where you came from, what you are
			    looking at, and the actions that apply to the whole file. */}
			<FileHeader item={item} onBack={onBackWithGuard} />

			{/* §5: the switcher is only drawn when there is more than one thing to
			    choose from. With one previewer the content is the page. */}
			{previewers.length > 1 && (
				<div className="mb-3 flex flex-wrap items-center gap-1.5">
					{previewers.map((entry) => (
						<button
							key={entry.key}
							type="button"
							onClick={() => selectPreview(entry.key)}
							aria-pressed={entry.key === active}
							className={`tap rounded-md px-2.5 py-1 text-[12.5px] ${
								entry.key === active
									? "bg-info-10 font-medium text-white shadow-sm"
									: "text-neutral-11 hover:bg-row-hover hover:text-foreground"
							}`}
						>
							{t(entry.label)}
						</button>
					))}
				</div>
			)}

			<div className="pb-8">
				<FilePreview
					item={item}
					active={active}
					siblings={siblings}
					onDirtyChange={setDirty}
					onBack={onBackWithGuard}
				/>
			</div>
		</PageShell>
	);
}

/**
 * Back, guarded by the editor's unsaved state (§5.10).
 *
 * A function rather than an inline closure because the header renders it and the
 * editor's guard can fire from either: leaving the page through the breadcrumb and
 * leaving through the browser's own Back have to ask the same question.
 */
function useBackGuard(dirty: boolean, target: string) {
	const navigate = useNavigate();
	const t = useT();
	return useCallback(() => {
		if (dirty && !window.confirm(t("global.unsaved_changes_confirm"))) return;
		navigate(target);
	}, [dirty, navigate, t, target]);
}

/**
 * The file page's one bar.
 *
 * §5 puts the previewer switcher at the top and nothing else, which left a file page
 * with no header — no way back except the browser's button, and no statement of what
 * the file is. The bar answers those two questions and holds the download action,
 * which every previewer offers and none should have to re-invent.
 */
function FileHeader({ item, onBack }: { item: FileObject; onBack: () => void }) {
	const t = useT();
	const [sharing, setSharing] = useState(false);
	return (
		<header className="flex items-center gap-2 py-2">
			<button
				type="button"
				onClick={onBack}
				className="tap flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-neutral-11 hover:bg-row-hover hover:text-foreground"
			>
				<Icon name="chevron-left" className="size-4" />
				{t("global.back")}
			</button>
			<span className="text-neutral-9" aria-hidden="true">
				/
			</span>
			<span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={item.path}>
				{item.name}
			</span>
			{/* §6.4 puts Share on the file's own menu. The file page had no menu, so
			    the action lives in its one bar — a link is the thing a person wants
			    from a file they are looking at. */}
			{!item.is_dir && (
				<>
					<button
						type="button"
						onClick={() => setSharing(true)}
						className="tap flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-neutral-11 hover:bg-row-hover hover:text-foreground"
					>
						<Icon name="share" className="size-4" />
						{t("toolbar.share")}
					</button>
					{sharing && <ShareDialog path={item.path} name={item.name} state={null} onClose={() => setSharing(false)} />}
				</>
			)}
		</header>
	);
}

function FilePreview({
	item,
	active,
	siblings,
	onDirtyChange,
	onBack,
}: {
	item: FileObject;
	active: PreviewKey | undefined;
	siblings: FileObject[];
	onDirtyChange: (dirty: boolean) => void;
	onBack: () => void;
}) {
	const t = useT();
	const navigate = useNavigate();
	const [saving, setSaving] = useState(false);

	switch (active) {
		case "image": {
			const gallery = siblings.length ? siblings : [item];
			const index = Math.max(
				0,
				gallery.findIndex((entry) => entry.path === item.path),
			);
			return <ImageViewer items={gallery} startIndex={index} onClose={onBack} />;
		}
		case "video":
			return <MediaViewer item={item} kind="video" />;
		case "audio":
			return <MediaViewer item={item} kind="audio" />;
		case "pdf":
			return <MediaViewer item={item} kind="pdf" />;
		case "html":
			return <HtmlViewer item={item} />;
		case "markdown":
			return <MarkdownBody item={item} />;
		case "text_editor":
			return <TextBody item={item} onDirtyChange={onDirtyChange} />;
		default:
			return (
				<DownloadPanel
					item={item}
					onDownload={() => {
						// `/d/*` authenticates by header, so the bytes come through the
						// api client and are handed to the browser as a blob.
						void (async () => {
							const { saveFile } = await import("../lib/download");
							const { notify } = await import("../lib/feedback");
							try {
								await saveFile(item.path, item.name);
							} catch (reason) {
								notify.error(reason);
							}
						})();
					}}
				/>
			);
	}
	// `saving` is read by the text body's own state; keeping it here would be a
	// second source of truth for the same thing.
	void saving;
	void setSaving;
	void navigate;
	void t;
}

/** Markdown, rendered (§5.7). */
function MarkdownBody({ item }: { item: FileObject }) {
	const loaded = useFileContents(item, "text");
	const t = useT();
	const [outline, setOutline] = useState(false);

	if (loaded.state === "loading") {
		return (
			<div className="flex min-h-40 items-center justify-center">
				<Loading size="lg" />
			</div>
		);
	}
	if (loaded.state === "error") {
		return (
			<StateMessage
				icon="alert-triangle"
				tone="danger"
				title={t("preview.read_failed")}
				className="min-h-40 justify-center"
			/>
		);
	}
	if (loaded.state !== "text") return null;

	return (
		<div className="rounded-xl bg-surface p-4">
			<div className="mb-3 flex items-center gap-2">
				<p className="truncate text-sm font-medium">{item.name}</p>
				<div className="ml-auto flex items-center gap-1">
					<button
						type="button"
						onClick={() => setOutline((value) => !value)}
						aria-pressed={outline}
						className={`tap rounded-md px-2 py-1 text-[11px] ${
							outline ? "bg-info-3 text-info-11" : "text-neutral-10 hover:text-foreground"
						}`}
					>
						{t("toolbar.toggle_markdown_toc")}
					</button>
				</div>
			</div>
			<MarkdownViewer text={loaded.text} outline={outline} onToggleOutline={() => setOutline(false)} />
		</div>
	);
}

/** The editor (§5.10). */
function TextBody({ item, onDirtyChange }: { item: FileObject; onDirtyChange: (dirty: boolean) => void }) {
	const loaded = useFileContents(item, "text");
	const t = useT();

	if (loaded.state === "loading") {
		return (
			<div className="flex min-h-40 items-center justify-center">
				<Loading size="lg" />
			</div>
		);
	}
	if (loaded.state === "error") {
		return (
			<StateMessage
				icon="alert-triangle"
				tone="danger"
				title={t("preview.read_failed")}
				className="min-h-40 justify-center"
			/>
		);
	}
	if (loaded.state !== "text") return null;

	return (
		<TextEditor
			// Keyed by path: the editor owns its buffer once mounted, so a new file has to
			// be a new editor rather than the old one handed different text.
			key={item.path}
			item={item}
			text={loaded.text}
			// The Worker is the authority on writability; a `NoWrite` mask only shows
			// up on a write, so the editor offers the field and reports the refusal.
			canWrite
			onDirtyChange={onDirtyChange}
		/>
	);
}

/**
 * The previewers a file can actually use (§5.1).
 *
 * The spec's table has twenty entries; the ones below are the subset this app can
 * render, in the spec's own order. `download` is always last, and always present —
 * it is the page §5.2 defines for a file with nothing better to show.
 */
export function previewersFor(
	item: FileObject,
	kind: ReturnType<typeof kindOf>,
): Array<{
	key: PreviewKey;
	label:
		| "preview.names.download"
		| "preview.names.image"
		| "preview.names.video"
		| "preview.names.audio"
		| "preview.names.pdf"
		| "preview.names.markdown"
		| "preview.names.text_editor"
		| "preview.names.html";
}> {
	const list: Array<{
		key: PreviewKey;
		label:
			| "preview.names.download"
			| "preview.names.image"
			| "preview.names.video"
			| "preview.names.audio"
			| "preview.names.pdf"
			| "preview.names.markdown"
			| "preview.names.text_editor"
			| "preview.names.html";
	}> = [];
	// §5.1's ordering rule: a text file of 1 MiB or more puts the download page
	// first, because the editor would have to hold the whole thing to show it.
	const oversizedText =
		(kind === "text" || kind === "markdown" || kind === "url" || kind === "html") && item.size >= 1024 * 1024;
	if (oversizedText) list.push({ key: "download", label: "preview.names.download" });
	switch (kind) {
		case "html":
			list.push({ key: "html", label: "preview.names.html" });
			break;
		case "markdown":
			// A Markdown file opens in the editor, with the rendered view available
			// as a mode inside it (see TextEditor). It used to open on the renderer,
			// which is the wrong default for the file you are most likely to want to
			// *change*; §5.1's order still offers the renderer as the second choice.
			list.push({ key: "text_editor", label: "preview.names.text_editor" });
			list.push({ key: "markdown", label: "preview.names.markdown" });
			break;
		case "image":
			list.push({ key: "image", label: "preview.names.image" });
			break;
		case "video":
			list.push({ key: "video", label: "preview.names.video" });
			break;
		case "audio":
			list.push({ key: "audio", label: "preview.names.audio" });
			break;
		case "pdf":
			list.push({ key: "pdf", label: "preview.names.pdf" });
			break;
		case "text":
		case "url":
			list.push({ key: "text_editor", label: "preview.names.text_editor" });
			break;
		default:
			break;
	}
	// A text file under the editor's ceiling keeps the editor; anything else gets
	// nothing but the download page, which is what §5.2 is for. `download` is
	// appended only once, because the oversized case already put it first.
	if (!list.some((entry) => entry.key === "download")) {
		list.push({ key: "download", label: "preview.names.download" });
	}
	return list;
}

/** A file's path as a URL, for a link the interface renders. */
export function fileHref(path: string) {
	return pathToUrl(path);
}

/** The media type a download link should carry, when the response is silent. */
export function contentTypeFor(name: string) {
	return mimeFor(name) ?? "application/octet-stream";
}

export { formatDate };

/** Unused parameters kept off the public surface. */
export { ViewerFrame };

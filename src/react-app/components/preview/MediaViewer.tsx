import { useEffect, useMemo, useState } from "react";
import type { FileObject } from "../../lib/types";
import { formatSize } from "../../lib/format";
import { useT } from "../../hooks/useStore";
import { readFile } from "../../lib/api";
import { withMime } from "../../lib/format";
import { Loading, StateMessage } from "../../ui/Field";
import { ViewerFrame, useFileContents } from "./ViewerFrame";

/**
 * The four byte-based previewers: video, audio, PDF, and "no previewer at all".
 *
 * They are one component because they share one lifecycle — read the bytes, make an
 * object URL, hand it to an element — and differ only in which element that is. Each
 * branch below is the spec's own description of its format (§5.4, §5.5, §5.11), cut
 * to what a browser can actually do.
 *
 * Three things are deliberately *not* implemented, and each is a note in the spec
 * about a library rather than about a rule:
 *
 * - the video player's chapter bar, subtitle offset, aspect switching and screenshot
 *   come from ArtPlayer (§5.4 lists them as that player's features);
 * - the audio player's playlist UI and lyric scrolling are a player's own (§5.5);
 * - the PDF reader's theme following is the browser's built-in viewer (§5.11).
 *
 * The native elements below are honest about that: they play the file, they take
 * fullscreen, and they have no chrome this app has to maintain.
 */
export function MediaViewer({ item, kind }: { item: FileObject; kind: "video" | "audio" | "pdf" }) {
	const t = useT();
	const loaded = useFileContents(item, kind === "pdf" ? "blob" : "blob");

	return (
		<ViewerFrame height={kind === "audio" ? "auto" : kind === "pdf" ? "60vh" : "auto"}>
			{loaded.state === "loading" && <ViewerLoading />}
			{loaded.state === "error" && (
				<StateMessage
					icon="alert-triangle"
					tone="danger"
					title={t("preview.read_failed")}
					className="h-full justify-center"
				/>
			)}
			{loaded.state === "blob" && kind === "video" && (
				<video
					src={loaded.url}
					controls
					preload="metadata"
					className="mx-auto max-h-[70vh] w-full rounded-lg bg-black"
					// §5.4: the container takes the picture's own ratio once it is known.
					onLoadedMetadata={(event) => {
						const video = event.currentTarget;
						if (!video.videoWidth || !video.videoHeight) return;
						const ratio = video.videoWidth / video.videoHeight;
						video.style.aspectRatio = String(ratio);
					}}
				/>
			)}
			{loaded.state === "blob" && kind === "audio" && (
				<div className="flex flex-col gap-3 p-4">
					<div className="flex items-center gap-3">
						<div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-info-3">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
								className="size-6 text-info-9"
								aria-hidden="true"
							>
								<path d="M11 6v10.5M11 16.5a2.5 2.5 0 1 1-2.5-2.5M11 6l6-1.5v9" strokeLinecap="round" />
							</svg>
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-medium">{item.name}</p>
							<p className="numeric text-xs text-neutral-10">{formatSize(item.size)}</p>
						</div>
					</div>
					<audio src={loaded.url} controls autoPlay className="w-full" />
				</div>
			)}
			{loaded.state === "blob" && kind === "pdf" && (
				<object data={loaded.url} type="application/pdf" className="size-full rounded-lg">
					{/* A browser without a PDF plugin shows this instead of a blank
					    frame, which is what §5.11's note is about. */}
					<StateMessage
						icon="file-pdf"
						title={item.name}
						description={t("preview.download")}
						action={
							<a href={loaded.url} download={item.name} className="text-sm text-accent-11 underline">
								{t("preview.download")}
							</a>
						}
						className="h-full justify-center"
					/>
				</object>
			)}
		</ViewerFrame>
	);
}

/** The loading state every byte-based viewer shares. */
export function ViewerLoading() {
	return (
		<div className="flex h-full min-h-32 items-center justify-center">
			<Loading size="lg" />
		</div>
	);
}

/**
 * The HTML previewer (§5.9).
 *
 * A sandboxed `iframe` fed from a blob URL. The sandbox is `allow-scripts` only: a
 * previewed page must not be able to navigate the app's own frame or reach its
 * storage, and `srcdoc` from a script-running document without that restriction
 * would be a same-origin script injection with extra steps.
 */
export function HtmlViewer({ item }: { item: FileObject }) {
	const t = useT();
	const loaded = useFileContents(item, "text");
	const text = loaded.state === "text" ? loaded.text : null;
	const url = useObjectUrl(text);

	return (
		<ViewerFrame height="70vh">
			{loaded.state === "loading" && <ViewerLoading />}
			{loaded.state === "error" && (
				<StateMessage
					icon="alert-triangle"
					tone="danger"
					title={t("preview.read_failed")}
					className="h-full justify-center"
				/>
			)}
			{url && <iframe src={url} sandbox="allow-scripts" title={item.name} className="size-full rounded-lg bg-white" />}
		</ViewerFrame>
	);
}

/**
 * The download page (§5.2), which is what a file with nothing to render gets.
 *
 * §5.2's layout: a thumbnail, the name, a grey line of size · modified · driver, and
 * the buttons. The QR code and the "Open with" list are absent because they need a
 * dependency and a configured external player respectively; the copy-link and
 * download pair is what the page is actually for.
 */
export function DownloadPanel({ item, onDownload }: { item: FileObject; onDownload: () => void }) {
	const t = useT();
	const [copied, setCopied] = useState(false);

	async function copyLink() {
		try {
			// The absolute URL of the file's own bytes. It is authenticated, so this
			// is a link for a client that can present the token — which is what the
			// spec's "copy link" means in a deployment with a session.
			await navigator.clipboard.writeText(`${globalThis.location.origin}/d${encodeURI(item.path)}`);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			const { notify } = await import("../../lib/feedback");
			notify.error(t("global.clipboard_denied"));
		}
	}

	return (
		<div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
			<div className="flex size-20 items-center justify-center rounded-2xl bg-neutral-3">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.1}
					className="size-10 text-neutral-9"
					aria-hidden="true"
				>
					<path d="M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</div>
			<h3 className="max-w-lg text-lg font-medium break-all">{item.name}</h3>
			<p className="numeric text-xs text-neutral-10">
				{formatSize(item.size)}
				{"  ·  "}
				{item.modified}
				{typeof item.provider === "string" && (
					<>
						{"  ·  "}
						{item.provider}
					</>
				)}
			</p>
			<div className="mt-2 flex flex-wrap items-center justify-center gap-2">
				<button
					type="button"
					onClick={() => void copyLink()}
					className="tap rounded-lg bg-accent-3 px-3 py-1.5 text-[13px] font-medium text-accent-11 hover:bg-accent-4"
				>
					{copied ? t("global.copied") : t("preview.copy_link")}
				</button>
				<button
					type="button"
					onClick={onDownload}
					className="tap rounded-lg bg-primary-9 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-primary-10"
				>
					{t("preview.download")}
				</button>
			</div>
		</div>
	);
}

/**
 * An HTML document as a `blob:` URL, for the sandboxed frame.
 *
 * Built from the text rather than from the response's blob, so the sandbox sees a
 * document rather than whatever type the storage reported. `useMemo` rather than state
 * because the URL is *derived* — there is no second source of truth to keep in step — and
 * the effect beside it exists only to revoke the previous URL, which is the one thing a
 * memo cannot do for itself.
 */
function useObjectUrl(text: string | null): string | null {
	const url = useMemo(() => {
		if (text === null) return null;
		return URL.createObjectURL(new Blob([text], { type: "text/html;charset=utf-8" }));
	}, [text]);

	useEffect(() => {
		if (!url) return;
		return () => URL.revokeObjectURL(url);
	}, [url]);

	return url;
}

/** Kept for the download panel's own type: the file's bytes as a URL. */
export async function objectUrlFor(item: FileObject): Promise<string> {
	const response = await readFile(item.path);
	return URL.createObjectURL(withMime(await response.blob(), item.name));
}

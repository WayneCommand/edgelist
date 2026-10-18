import { useEffect, useState } from "react";
import { readFile } from "../../lib/api";
import { useT } from "../../hooks/useStore";
import type { FileObject } from "../../lib/types";
import { Loading, StateMessage } from "../../ui/Field";

/**
 * Reading a file, once, for whichever viewer is showing it.
 *
 * The `/d/*` route is authenticated by header, so a previewer cannot point an `<img>` or a
 * `<video>` at it (§5, and `api.ts` explains why). Every viewer therefore gets its bytes
 * from here: text as a string for the editor and the markdown renderer, everything else as
 * an object URL.
 *
 * The result is *keyed by path* rather than paired with a loading flag. A viewer handed a
 * new file reads `loaded.for !== item.path` and shows its spinner, so nothing is set on the
 * way in — the one synchronous `setState` inside an effect is the one that costs a wasted
 * render before the fetch has even started.
 *
 * The object URL is revoked when the file changes or the viewer unmounts. That is not
 * tidiness: an object URL pins its blob until revoked, and a 40 MB video opened and closed
 * five times would hold 200 MB for the life of the tab.
 */
export type LoadedFile =
	| { state: "loading" }
	| { state: "error"; message: string }
	/** Text was requested; `text` is the decoded body. */
	| { state: "text"; text: string }
	/** Bytes were requested; `url` is an object URL the caller must not revoke. */
	| { state: "blob"; url: string; size: number };

type Keyed = { for: string } & LoadedFile;

export function useFileContents(item: FileObject | null, mode: "text" | "blob" | "none"): LoadedFile {
	const [loaded, setLoaded] = useState<Keyed | null>(null);
	const path = item?.path ?? "";

	useEffect(() => {
		if (!item || mode === "none") return;
		let cancelled = false;
		let created: string | null = null;

		(async () => {
			try {
				const response = await readFile(item.path);
				if (mode === "text") {
					const text = await response.text();
					if (!cancelled) setLoaded({ for: item.path, state: "text", text });
					return;
				}
				const blob = await response.blob();
				if (cancelled) return;
				created = URL.createObjectURL(blob);
				setLoaded({ for: item.path, state: "blob", url: created, size: blob.size });
			} catch (reason) {
				if (!cancelled)
					setLoaded({
						for: item.path,
						state: "error",
						message: reason instanceof Error ? reason.message : "",
					});
			}
		})();

		return () => {
			cancelled = true;
			if (created) URL.revokeObjectURL(created);
		};
	}, [item, mode]);

	// A result for a different file is not this file's result.
	if (!item || mode === "none" || !loaded || loaded.for !== path) return { state: "loading" };
	return loaded;
}

/**
 * The frame every viewer shares, plus §5.12's two floating buttons.
 *
 * "Full viewport" and "native fullscreen" are separate things in the spec and stay separate
 * here: the first is a `position: fixed` overlay at the modal layer with a blurred backdrop,
 * the second is the browser's own fullscreen API. A viewer gets both for free by wrapping
 * its content in this.
 */
export function ViewerFrame({
	children,
	height = "70vh",
	extra,
	className = "",
}: {
	children: React.ReactNode;
	/** The viewer's own height; §5 gives each format one. */
	height?: string;
	extra?: React.ReactNode;
	className?: string;
}) {
	const t = useT();
	const [fullView, setFullView] = useState(false);
	const native = useIsFullscreen();

	async function toggleNative() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
		} catch {
			// §5.12: a refusal is reported, not swallowed.
			const { notify } = await import("../../lib/feedback");
			notify.error(t("preview.fullscreen_failed"));
		}
	}

	return (
		<div
			className={`relative w-full overflow-hidden rounded-xl ${fullView ? "fixed inset-0 z-modal bg-background/95 backdrop-blur-sm" : "bg-neutral-2"} ${className}`}
			style={fullView ? undefined : { height }}
		>
			<div className={fullView ? "size-full p-4" : "size-full"}>{children}</div>
			<div className="absolute right-2 bottom-2 flex flex-col gap-1 rounded-lg bg-black/5 p-1 opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100">
				{extra}
				{!native && (
					<FrameButton
						onPress={() => setFullView((value) => !value)}
						label={fullView ? t("preview.exit_fullview") : t("preview.fullview")}
						collapse={fullView}
					/>
				)}
				<FrameButton
					onPress={() => void toggleNative()}
					label={native ? t("preview.exit_fullscreen") : t("preview.fullscreen")}
					collapse={native}
				/>
			</div>
		</div>
	);
}

function FrameButton({ onPress, label, collapse }: { onPress: () => void; label: string; collapse: boolean }) {
	return (
		<button
			type="button"
			onClick={onPress}
			aria-label={label}
			title={label}
			className="tap flex size-8 items-center justify-center rounded-md text-neutral-11 hover:bg-row-hover hover:text-foreground"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				className="size-4"
				aria-hidden="true"
			>
				{collapse ? (
					<path d="M9 4.5V9H4.5M15 4.5V9h4.5M19.5 15H15v4.5M4.5 15H9v4.5" strokeLinecap="round" />
				) : (
					<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" strokeLinecap="round" />
				)}
			</svg>
		</button>
	);
}

/**
 * Whether the document is in native fullscreen.
 *
 * A subscription, not state written from an effect: `fullscreenchange` is the event that
 * says so, and the browser is the authority — pressing Esc leaves fullscreen without
 * telling the component anything.
 */
function useIsFullscreen(): boolean {
	const [native, setNative] = useState(false);
	useEffect(() => {
		const onChange = () => setNative(Boolean(document.fullscreenElement));
		document.addEventListener("fullscreenchange", onChange);
		onChange();
		return () => document.removeEventListener("fullscreenchange", onChange);
	}, []);
	return native;
}

/** A viewer's own loading and failure states, so six viewers do not invent six. */
export function ViewerState({ error }: { error?: string }) {
	const t = useT();
	if (!error) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loading size="lg" />
			</div>
		);
	}
	return (
		<StateMessage
			icon="alert-triangle"
			tone="danger"
			title={error || t("preview.read_failed")}
			className="h-full justify-center"
		/>
	);
}

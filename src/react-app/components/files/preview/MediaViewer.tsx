import { useT } from "../../../hooks/useLocale";

type MediaViewerProps = {
	url: string;
	kind: "video" | "audio";
};

/**
 * `preload="metadata"` is the right default for a file manager: it gets the
 * duration and dimensions so the controls are usable immediately, without
 * pulling a multi-gigabyte video through the Worker first. Seeking works because
 * `/d/*` forwards the `Range` header to the driver.
 */
export function MediaViewer({ url, kind }: MediaViewerProps) {
	const t = useT();
	return (
		<div className="space-y-2">
			<div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-secondary p-4">
				{kind === "video" ? (
					<video src={url} controls preload="metadata" className="max-h-[min(64vh,600px)] w-full rounded-lg bg-black" />
				) : (
					<audio src={url} controls preload="metadata" className="w-full" />
				)}
			</div>
			{kind === "video" && (
				// `.mov` and `.mkv` are the common casualties, and a black rectangle
				// with no explanation is the worst possible answer to them.
				<p className="text-xs text-muted">{t("preview.codecs")}</p>
			)}
		</div>
	);
}

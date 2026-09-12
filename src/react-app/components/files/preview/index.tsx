import { Suspense } from "react";
import { Button as HeroButton, Skeleton } from "@heroui/react";
import { useT } from "../../../hooks/useLocale";
import { previewCaption, type PreviewKind } from "../../../lib/preview";
import type { FileItem } from "../../../lib/types";
import { Modal } from "../../common/Modal";
import { ImageViewer } from "./ImageViewer";
import { LazyTextViewer } from "./lazyTextViewer";
import { MarkdownViewer } from "./MarkdownViewer";
import { MediaViewer } from "./MediaViewer";
import { PdfViewer } from "./PdfViewer";
import { UnsupportedViewer } from "./UnsupportedViewer";

/**
 * What the previewer is showing. `text` is set for the kinds that need the file
 * as text and `url` for the ones that need it as bytes — never both.
 */
export type PreviewSource = {
	item: FileItem;
	kind: PreviewKind;
	text?: string;
	url?: string;
};

export type PreviewActions = {
	dirty: boolean;
	saving: boolean;
	onChange: (text: string) => void;
	onSave: () => void;
	onDownload: () => void;
};

const editorFallback = <Skeleton className="h-[min(68vh,640px)] min-h-[360px] w-full rounded-lg" />;

/**
 * Picks the previewer for a file. The choice is made from the extension alone
 * (`previewKindFor`) and this component does nothing else — no viewer knows
 * about any other viewer, and adding a format means adding a branch here and a
 * file beside it.
 */
export function PreviewBody({
	source,
	dirty,
	saving,
	onChange,
	onSave,
	onDownload,
}: { source: PreviewSource } & PreviewActions) {
	const t = useT();
	const { item, kind } = source;

	if (kind === "text") {
		return (
			<Suspense fallback={editorFallback}>
				<LazyTextViewer
					item={item}
					text={source.text ?? ""}
					dirty={dirty}
					saving={saving}
					onChange={onChange}
					onSave={onSave}
				/>
			</Suspense>
		);
	}

	if (kind === "markdown") {
		// The viewer loads the editor itself when Source is picked, so it needs no
		// boundary of its own here.
		return (
			<MarkdownViewer
				item={item}
				text={source.text ?? ""}
				dirty={dirty}
				saving={saving}
				onChange={onChange}
				onSave={onSave}
			/>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs text-muted">{previewCaption(kind, item.name, item.size, t)}</p>
				<HeroButton size="sm" variant="secondary" onPress={onDownload}>
					{t("action.download")}
				</HeroButton>
			</div>
			<BinaryViewer source={source} />
		</div>
	);
}

function BinaryViewer({ source }: { source: PreviewSource }) {
	const url = source.url ?? "";
	switch (source.kind) {
		case "image":
			return <ImageViewer item={source.item} url={url} />;
		case "pdf":
			return <PdfViewer title={source.item.name} url={url} />;
		case "video":
			return <MediaViewer url={url} kind="video" />;
		case "audio":
			return <MediaViewer url={url} kind="audio" />;
		default:
			// `office` and `toolarge`, plus `none` as a safety net for a caller that
			// previews a file with no previewer at all.
			return <UnsupportedViewer item={source.item} kind={source.kind} />;
	}
}

/** The modal around `PreviewBody`, with the unsaved-changes marker in its title. */
export function FilePreview({
	source,
	onClose,
	...actions
}: { source: PreviewSource; onClose: () => void } & PreviewActions) {
	return (
		<Modal wide title={`${source.item.name}${actions.dirty ? " *" : ""}`} onClose={onClose}>
			<PreviewBody source={source} {...actions} />
		</Modal>
	);
}

import { Suspense, useMemo, useState } from "react";
import { Skeleton } from "@heroui/react";
import { useT } from "../../../hooks/useLocale";
import type { MessageKey } from "../../../lib/i18n";
import { renderMarkdown } from "../../../lib/markdown";
import { previewCaption } from "../../../lib/preview";
import type { FileItem } from "../../../lib/types";
import { SegmentedControl } from "../../common/SegmentedControl";
import { LazyTextViewer } from "./lazyTextViewer";
import { FRAME, FRAME_RADIUS, PAD, PAGE, PANEL } from "./metrics";

type MarkdownMode = "rendered" | "source";

export type MarkdownViewerProps = {
	item: FileItem;
	text: string;
	dirty: boolean;
	saving: boolean;
	onChange: (text: string) => void;
	onSave: () => void;
};

/**
 * Markdown opens rendered, but the editor is one click away. A `.md` file was
 * editable before this previewer existed, and dropping that would take a
 * working feature away in the name of adding one.
 *
 * The switch moves into the editor's own toolbar in Source mode, so there is
 * only ever one row of controls — and one Save button.
 */
export function MarkdownViewer({ item, text, dirty, saving, onChange, onSave }: MarkdownViewerProps) {
	const t = useT();
	const [mode, setMode] = useState<MarkdownMode>("rendered");
	const html = useMemo(() => renderMarkdown(text), [text]);
	const modeSwitch = <ModeSwitch mode={mode} onChange={setMode} />;

	if (mode === "source") {
		return (
			<Suspense fallback={<Skeleton className={`${PANEL} w-full ${FRAME_RADIUS}`} />}>
				<LazyTextViewer
					item={item}
					text={text}
					dirty={dirty}
					saving={saving}
					onChange={onChange}
					onSave={onSave}
					leading={modeSwitch}
				/>
			</Suspense>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-xs text-muted">{previewCaption("markdown", item.name, item.size, t)}</p>
				{modeSwitch}
			</div>
			{text.trim() ? (
				// `renderMarkdown` escapes its input before adding anything, so the
				// only markup here is the markup it wrote itself.
				//
				// On the page surface rather than in a well: this is prose, and the
				// code blocks inside it are drawn on `surface-tertiary`, which needs
				// the white behind it to read as a block at all.
				<div
					className={`markdown-body ${PANEL} overflow-auto ${FRAME} ${PAGE} ${PAD} text-sm`}
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				// No panel height here: "This file is empty." is a sentence, and the
				// same rule already applies to the audio player and the
				// no-previewer notice.
				<p className={`${FRAME} ${PAGE} ${PAD} text-sm text-muted`}>{t("preview.empty")}</p>
			)}
		</div>
	);
}

const MODES: ReadonlyArray<{ mode: MarkdownMode; label: MessageKey }> = [
	{ mode: "rendered", label: "preview.rendered" },
	{ mode: "source", label: "preview.source" },
];

function ModeSwitch({ mode, onChange }: { mode: MarkdownMode; onChange: (mode: MarkdownMode) => void }) {
	const t = useT();
	return (
		<SegmentedControl
			ariaLabel={t("preview.markdownView")}
			value={mode}
			onChange={onChange}
			options={MODES.map((option) => ({ value: option.mode, label: t(option.label) }))}
		/>
	);
}

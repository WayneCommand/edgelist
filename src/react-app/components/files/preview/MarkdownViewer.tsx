import { Suspense, useMemo, useState } from "react";
import { Skeleton } from "@heroui/react";
import { useT } from "../../../hooks/useLocale";
import type { MessageKey } from "../../../lib/i18n";
import { renderMarkdown } from "../../../lib/markdown";
import { previewCaption } from "../../../lib/preview";
import type { FileItem } from "../../../lib/types";
import { LazyTextViewer } from "./lazyTextViewer";

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
			<Suspense fallback={<Skeleton className="h-[min(68vh,640px)] min-h-[360px] w-full rounded-lg" />}>
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
				<div
					className="markdown-body max-h-[min(68vh,640px)] overflow-auto rounded-lg border border-border bg-surface p-5 text-sm"
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				<p className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">{t("preview.empty")}</p>
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
		<div
			role="group"
			aria-label={t("preview.markdownView")}
			className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
		>
			{MODES.map((option) => (
				<button
					key={option.mode}
					type="button"
					aria-pressed={mode === option.mode}
					onClick={() => onChange(option.mode)}
					className={`rounded-md px-2 py-1 text-xs transition-colors ${
						mode === option.mode ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
					}`}
				>
					{t(option.label)}
				</button>
			))}
		</div>
	);
}

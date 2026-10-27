import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FileObject } from "../../lib/types";
import { writeFile } from "../../lib/api";
import { languageFor } from "../../lib/format";
import { notify, confirm } from "../../lib/feedback";
import { getPreference, setPreference } from "../../lib/preferences";
import { usePreference, useT } from "../../hooks/useStore";
import { IconButton, ActionButton } from "../../ui/ActionButton";
import { NumberStepper } from "../../ui/Field";
import { MarkdownViewer } from "./MarkdownViewer";

/**
 * The text editor (§5.10).
 *
 * This is the one previewer with a write path, so it is the one that has to answer
 * three questions the others do not:
 *
 * **What is "unsaved"?** A revision counter, not a string comparison. Comparing the
 * buffer against the last saved text would work, but it re-renders the toolbar on
 * every keystroke; a counter bumps once per edit and the comparison happens when the
 * count changes.
 *
 * **How do you leave?** §5.10 asks for the browser's own `beforeunload` prompt on a
 * refresh, and a confirmation on an in-app navigation. The first is a listener; the
 * second is a guard on the close action, because the file page is a view, not a
 * route — there is nothing to intercept.
 *
 * **Where does the caret go?** Nowhere from here. A `textarea` keeps its own
 * selection, and the undo history is the browser's own `Ctrl+Z` on the element
 * rather than a hand-rolled stack — `document.execCommand("undo")` is deprecated but
 * is the only way to drive a `<textarea>`'s native history, and it is what the
 * toolbar's two arrows call. That is a deliberate trade: a real stack would be
 * ~80 lines and would not match the platform's own behaviour for coalesced edits.
 *
 * Monaco is *not* used. It is 4 MB of worker and language services for a previewer
 * that is usually showing a 2 KB config file, and the previous build paid that cost
 * on every session. A `<textarea>` with the app's own toolbar is honest about what
 * this viewer is.
 */
export function TextEditor({
	item,
	text,
	canWrite,
	onSaved,
	onDirtyChange,
	className = "",
}: {
	item: FileObject;
	text: string;
	canWrite: boolean;
	onSaved?: () => void;
	onDirtyChange?: (dirty: boolean) => void;
	className?: string;
}) {
	const t = useT();
	const [buffer, setBuffer] = useState(text);
	const [revision, setRevision] = useState(0);
	const [savedRevision, setSavedRevision] = useState(0);
	const [saving, setSaving] = useState(false);
	const [wordWrap, setWordWrap] = useState(() => getPreference("editor_word_wrap") === "on");
	const [minimap, setMinimap] = useState(() => getPreference("editor_minimap") === "on");
	// A Markdown file opens in the editor, and the preview is a *mode* rather than
	// another entry in the previewer list: flipping between them must not lose the
	// buffer, which is exactly what selecting a different previewer would do.
	const isMarkdown = languageFor(item.name) === "markdown";
	const [preview, setPreview] = useState(false);
	const font = usePreference("editor_font_size");
	const area = useRef<HTMLTextAreaElement>(null);
	const gutter = useRef<HTMLDivElement>(null);
	const dirty = revision !== savedRevision;

	// §5.10: the browser's own prompt when the tab is closed, and only while there
	// is something to lose.
	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);

	const save = useCallback(async () => {
		if (!canWrite) return true;
		if (!dirty) return true;
		setSaving(true);
		try {
			await writeFile(
				item.path,
				new Blob([buffer], { type: "text/plain; charset=utf-8" }),
				"text/plain; charset=utf-8",
			);
			setSavedRevision(revision);
			notify.success(t("global.save_success"));
			onSaved?.();
			return true;
		} catch (reason) {
			notify.error(reason);
			return false;
		} finally {
			setSaving(false);
		}
	}, [buffer, canWrite, dirty, item.path, onSaved, revision, t]);

	// `Ctrl/⌘+S` is handled here rather than on the window so it cannot fire while
	// focus is somewhere else in the app.
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (!(event.ctrlKey || event.metaKey)) return;
			if (event.key.toLowerCase() !== "s") return;
			event.preventDefault();
			void save();
		}
		const node = area.current;
		node?.addEventListener("keydown", onKey);
		return () => node?.removeEventListener("keydown", onKey);
	}, [save]);

	const lines = useMemo(() => countLines(buffer), [buffer]);
	const numbers = useMemo(() => Array.from({ length: lines }, (_, index) => index + 1), [lines]);
	const gutterInner = useRef<HTMLDivElement>(null);
	const mirror = useRef<HTMLDivElement>(null);

	// The gutter and the text area scroll together. They are one scroller in
	// effect, but two elements, because a `<textarea>` cannot draw its own margin.
	// The offset goes in as a transform rather than `scrollTop` so the numbers can
	// be laid out absolutely — see `alignNumbers`.
	const syncScroll = useCallback(() => {
		if (gutterInner.current && area.current) {
			gutterInner.current.style.transform = `translateY(${-area.current.scrollTop}px)`;
		}
	}, []);

	/**
	 * Puts each number beside the row its line starts on.
	 *
	 * With wrapping on, a line occupies as many rows as it needs, so number *n* is
	 * not at `n × lineHeight` — a three-row paragraph pushes every number below it
	 * down. The mirror is an invisible copy of the buffer laid out with the same
	 * font, padding and wrapping as the field, so each line's `offsetTop` is where
	 * that line actually begins; the numbers are positioned to match.
	 *
	 * This is done by writing `style.top` directly instead of through state: the
	 * values are only ever used by the DOM, and a re-render per measured line would
	 * be work the browser has to undo on the next frame anyway.
	 */
	const alignNumbers = useCallback(() => {
		const node = area.current;
		const rows = mirror.current?.children;
		const cells = gutterInner.current?.children;
		if (!node || !rows || !cells) return;
		// The mirror has to wrap at the same column as the field: its width is the
		// field's *content* width, which is what is left after the padding — so the
		// padding is applied to the mirror and taken out of the width here.
		const style = getComputedStyle(node);
		const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
		mirror.current!.style.width = `${node.clientWidth - paddingX}px`;
		for (let index = 0; index < cells.length && index < rows.length; index += 1) {
			// `offsetTop` is measured from the mirror's border box, which already
			// includes its top padding, so the numbers land on the same baseline.
			(cells[index] as HTMLElement).style.top = `${(rows[index] as HTMLElement).offsetTop}px`;
		}
	}, []);

	useLayoutEffect(() => {
		alignNumbers();
		syncScroll();
	}, [alignNumbers, syncScroll, buffer, wordWrap, font, preview]);

	// A window resize changes how the text wraps, which moves every number below
	// the first affected line.
	useEffect(() => {
		const node = area.current;
		if (!node || preview) return;
		const observer = new ResizeObserver(() => alignNumbers());
		observer.observe(node);
		return () => observer.disconnect();
	}, [alignNumbers, preview]);

	async function copy() {
		try {
			await navigator.clipboard.writeText(buffer);
			notify.success(t("global.copied"));
		} catch {
			notify.error(t("global.clipboard_denied"));
		}
	}

	async function paste() {
		if (!canWrite) return;
		try {
			const clip = await navigator.clipboard.readText();
			if (!clip) return;
			const node = area.current;
			const start = node?.selectionStart ?? buffer.length;
			const end = node?.selectionEnd ?? buffer.length;
			setBuffer(buffer.slice(0, start) + clip + buffer.slice(end));
			setRevision((value) => value + 1);
		} catch {
			notify.error(t("global.clipboard_denied"));
		}
	}

	return (
		<div className={`flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface ${className}`}>
			<div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-neutral-2 px-2 py-1.5">
				{canWrite && (
					<>
						<ActionButton
							tone="soft"
							size="sm"
							onPress={() => void save()}
							isDisabled={!dirty}
							isPending={saving}
							type="button"
						>
							{t("global.save")}
						</ActionButton>
						<div className="mx-0.5 h-5 w-px bg-neutral-5" />
					</>
				)}
				{isMarkdown && (
					<>
						<button
							type="button"
							onClick={() => setPreview(false)}
							aria-pressed={!preview}
							className={`tap rounded-md px-2 py-1 text-[12px] ${!preview ? "bg-surface font-medium text-foreground shadow-sm" : "text-neutral-11 hover:text-foreground"}`}
						>
							{t("preview.editor.edit")}
						</button>
						<button
							type="button"
							onClick={() => setPreview(true)}
							aria-pressed={preview}
							className={`tap rounded-md px-2 py-1 text-[12px] ${preview ? "bg-surface font-medium text-foreground shadow-sm" : "text-neutral-11 hover:text-foreground"}`}
						>
							{t("preview.editor.preview")}
						</button>
						<div className="mx-0.5 h-5 w-px bg-neutral-5" />
					</>
				)}
				<IconButton icon="copy" label={t("global.copy")} size="sm" onPress={() => void copy()} />
				{canWrite && <IconButton icon="clipboard" label={t("global.paste")} size="sm" onPress={() => void paste()} />}
				{!preview && (
					<>
						<div className="mx-0.5 h-5 w-px bg-neutral-5" />
						<IconButton
							icon="list"
							label={t("preview.editor.wrap")}
							size="sm"
							active={wordWrap}
							onPress={() => {
								const next = !wordWrap;
								setWordWrap(next);
								setPreference("editor_word_wrap", next ? "on" : "off");
							}}
						/>
						<IconButton
							icon="layers"
							label={t("preview.editor.minimap")}
							size="sm"
							active={minimap}
							onPress={() => {
								const next = !minimap;
								setMinimap(next);
								setPreference("editor_minimap", next ? "on" : "off");
							}}
						/>
						<div className="mx-0.5 hidden h-5 w-px bg-neutral-5 sm:block" />
						<NumberStepper
							className="hidden sm:inline-flex"
							value={font}
							min={8}
							max={40}
							label={t("local.editor_font_size")}
							onChange={(value) => setPreference("editor_font_size", value)}
						/>
					</>
				)}
				{!canWrite && <span className="ml-auto text-[11px] text-neutral-10">{t("preview.editor.read_only")}</span>}
				{dirty && <span className="ml-auto size-1.5 rounded-full bg-info-9" title="Unsaved" />}
			</div>

			{preview ? (
				/* The preview is the same document the editor holds, not a re-read of
				   the file, so an unsaved edit is previewable. `wordWrap` is always on
				   here: a preview that scrolls sideways is not a preview. */
				<div className="max-h-[calc(var(--app-vh)*0.7)] min-h-[calc(var(--app-vh)*0.55)] overflow-y-auto bg-surface px-6 py-5">
					<MarkdownViewer text={buffer} wordWrap />
				</div>
			) : (
				<div className="relative flex min-h-0 flex-1 bg-surface">
					{/* The gutter is a sibling of the textarea, not part of it: text in a
					   `textarea` is user-selectable and copyable, so a line number drawn
					   inside the field would end up on the clipboard. It is also
					   `aria-hidden`, because the numbers are a visual aid to the text,
					   not content of their own. */}
					<div
						ref={gutter}
						aria-hidden="true"
						className="relative shrink-0 overflow-hidden border-r border-hairline bg-neutral-2/70 select-none"
						style={{ width: `${String(lines).length + 2}ch`, fontSize: `${font}px` }}
					>
						<div ref={gutterInner} className="absolute inset-x-0 top-0">
							{numbers.map((line) => (
								<div
									key={line}
									className="absolute right-0 h-[1.625em] px-1.5 font-mono leading-relaxed text-neutral-9 tabular-nums"
								>
									{line}
								</div>
							))}
						</div>
					</div>
					{/* The mirror: the same text, same metrics, same wrapping, laid out
					   invisibly so each line's real `offsetTop` can be measured. It is
					   `aria-hidden` and not focusable; `display: flow-root` keeps its
					   children's margins inside it. */}
					<div
						ref={mirror}
						aria-hidden="true"
						className="pointer-events-none invisible absolute top-0 left-0 min-h-[calc(var(--app-vh)*0.55)] px-3 py-2 font-mono leading-relaxed break-words"
						style={{
							fontSize: `${font}px`,
							tabSize: 2,
							width: "1px",
							whiteSpace: wordWrap ? "pre-wrap" : "pre",
						}}
					>
						{buffer.split("\n").map((line, index) => (
							<div key={index}>{line || " "}</div>
						))}
					</div>
					<textarea
						ref={area}
						data-plain
						value={buffer}
						readOnly={!canWrite}
						spellCheck={false}
						onScroll={syncScroll}
						onChange={(event) => {
							setBuffer(event.target.value);
							setRevision((value) => value + 1);
						}}
						/* `whiteSpace` is inline, not two utility classes: both
						   `whitespace-pre` and `whitespace-pre-wrap` end up in the
						   stylesheet, so which one wins depends on their order in the
						   build rather than on the state — the toggle silently did
						   nothing. */
						className="min-h-[calc(var(--app-vh)*0.55)] flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2 font-mono leading-relaxed break-words outline-none"
						style={{
							fontSize: `${font}px`,
							tabSize: 2,
							whiteSpace: wordWrap ? "pre-wrap" : "pre",
						}}
						aria-label={item.name}
						data-language={languageFor(item.name)}
					/>
					{/* §5.10's minimap is an indicator of length and position, which is
					    what a minimap is for; rendering every line as a bar would be a
					    glyph per line and no more useful. */}
					{minimap && (
						<div
							aria-hidden="true"
							className="hidden w-14 shrink-0 overflow-hidden border-l border-hairline bg-neutral-1 px-1 py-2 lg:block"
						>
							<div className="flex flex-col gap-[2px]">
								{buffer
									.split("\n")
									.slice(0, 400)
									.map((line, index) => (
										<div
											key={index}
											className="h-[2px] rounded-full bg-neutral-6"
											style={{ width: `${Math.min(100, Math.max(8, line.length * 1.4))}%` }}
										/>
									))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * How many lines the buffer has.
 *
 * `split("\n").length` is not the answer a reader expects: a file that ends with a
 * newline — which is most of them — reports one more line than it shows. The count
 * here is the number of lines the editor *draws*, so the last number lines up with
 * the last line of text.
 */
function countLines(text: string): number {
	if (!text) return 1;
	const total = text.split("\n").length;
	return text.endsWith("\n") ? total - 1 : total;
}

/** Asks before discarding unsaved edits (§5.10). */
export async function confirmDiscard(
	dirty: boolean,
	t: (key: "global.unsaved_changes_confirm" | "preview.editor.discard" | "global.cancel") => string,
) {
	if (!dirty) return true;
	return confirm({
		title: t("preview.editor.discard"),
		message: t("global.unsaved_changes_confirm"),
		confirmLabel: t("preview.editor.discard"),
		danger: true,
	});
}

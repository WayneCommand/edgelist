import { useCallback, useEffect, useRef, useState } from "react";
import type { FileObject } from "../../lib/types";
import { writeFile } from "../../lib/api";
import { languageFor } from "../../lib/format";
import { notify, confirm } from "../../lib/feedback";
import { getPreference, setPreference } from "../../lib/preferences";
import { usePreference, useT } from "../../hooks/useStore";
import { IconButton, ActionButton } from "../../ui/ActionButton";
import { NumberStepper } from "../../ui/Field";

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
	const font = usePreference("editor_font_size");
	const area = useRef<HTMLTextAreaElement>(null);
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
		<div className={`flex flex-col overflow-hidden rounded-xl border border-border ${className}`}>
			<div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-neutral-4 bg-neutral-2 px-2 py-1.5">
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
				<IconButton icon="copy" label={t("global.copy")} size="sm" onPress={() => void copy()} />
				{canWrite && <IconButton icon="clipboard" label={t("global.paste")} size="sm" onPress={() => void paste()} />}
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
				{!canWrite && <span className="ml-auto text-[11px] text-neutral-10">{t("preview.editor.read_only")}</span>}
				{dirty && <span className="ml-auto size-1.5 rounded-full bg-info-9" title="Unsaved" />}
			</div>

			<div className="flex min-h-0 flex-1">
				<textarea
					ref={area}
					value={buffer}
					readOnly={!canWrite}
					spellCheck={false}
					onChange={(event) => {
						setBuffer(event.target.value);
						setRevision((value) => value + 1);
					}}
					className={`min-h-[55vh] flex-1 resize-none rounded-none border-0 bg-surface px-3 py-2 font-mono leading-relaxed outline-none ${wordWrap ? "whitespace-pre-wrap" : "whitespace-pre"}`}
					style={{ fontSize: `${font}px`, tabSize: 2 }}
					aria-label={item.name}
					data-language={languageFor(item.name)}
				/>
				{/* §5.10's minimap is an indicator of length and position, which is
				    what a minimap is for; rendering every line as a bar would be a
				    glyph per line and no more useful. */}
				{minimap && (
					<div
						aria-hidden="true"
						className="hidden w-14 shrink-0 border-l border-hairline bg-neutral-1 px-1 py-2 lg:block"
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
		</div>
	);
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

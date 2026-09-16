import { useMemo, useState } from "react";
import { MonacoEditorReactComp } from "@typefox/monaco-editor-react";
import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";
import type { EditorAppConfig, TextContents } from "monaco-languageclient/editorApp";
import type { MonacoVscodeApiConfig } from "monaco-languageclient/vscodeApiWrapper";
import { currentTheme, type Theme } from "../../lib/theme";
import { FRAME, PANEL } from "../files/preview/metrics";

type MonacoTextEditorProps = {
	value: string;
	language: string;
	path: string;
	onChange: (value: string) => void;
};

/**
 * The editor follows the app's theme.
 *
 * It used to open on `Default Dark Modern` with `bg-[#1e1e1e]` hard-coded on the
 * frame, which made it the one black surface in a light interface — and the one
 * surface that would still have been black after a dark theme was wired up.
 * Both themes named here are VS Code's own, so the editor looks the same in
 * either, and the frame takes its edge and radius from the preview metrics like
 * every other viewer.
 */
function vscodeApiConfigFor(theme: Theme): MonacoVscodeApiConfig {
	return {
		$type: "extended",
		viewsConfig: { $type: "EditorService" },
		userConfiguration: {
			json: JSON.stringify({
				"workbench.colorTheme": theme === "dark" ? "Default Dark Modern" : "Default Light Modern",
				"editor.wordBasedSuggestions": "off",
				"editor.minimap.enabled": false,
				"editor.stickyScroll.enabled": false,
			}),
		},
		monacoWorkerFactory: configureDefaultWorkerFactory,
	};
}

function editorLanguage(language: string) {
	return language === "yaml" ? "yaml" : language;
}

export function MonacoTextEditor({ value, language, path, onChange }: MonacoTextEditorProps) {
	// Once mounted the editor owns its buffer, so the config only needs the
	// seed text. Callers key the component by path, which remounts it per file.
	const [initialValue] = useState(value);
	// Read once: the VS Code user configuration is consumed while the editor
	// starts up, so this is the theme the editor opens in. Changing the theme
	// while a file is open applies to the next file opened — the frame around
	// the editor follows CSS immediately either way, so the worst case is an
	// editor whose colours are one theme behind its own border.
	const [theme] = useState(currentTheme);
	const vscodeApiConfig = useMemo(() => vscodeApiConfigFor(theme), [theme]);
	const editorAppConfig = useMemo<EditorAppConfig>(
		() => ({
			codeResources: {
				modified: {
					text: initialValue,
					uri: `file://${path}`,
					enforceLanguageId: editorLanguage(language),
				},
			},
			readOnly: false,
			domReadOnly: false,
			overrideAutomaticLayout: false,
			editorOptions: {
				automaticLayout: true,
				fontSize: 14,
				padding: { top: 12, bottom: 12 },
				wordWrap: "on",
				scrollBeyondLastLine: false,
				minimap: { enabled: false },
			},
		}),
		[initialValue, language, path],
	);

	function handleTextChanged(changes: TextContents) {
		if (changes.modified !== undefined) onChange(changes.modified);
	}

	// No background of its own: the editor paints one from its theme, and a
	// transparent frame shows the dialog's surface until it does, which is right
	// in both themes.
	return (
		<div className={`${PANEL} overflow-hidden ${FRAME}`}>
			<MonacoEditorReactComp
				vscodeApiConfig={vscodeApiConfig}
				editorAppConfig={editorAppConfig}
				onTextChanged={handleTextChanged}
				onError={(error) => console.error("Monaco editor error", error)}
				style={{ height: "100%", width: "100%" }}
			/>
		</div>
	);
}

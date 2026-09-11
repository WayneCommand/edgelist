import { useMemo } from "react";
import { MonacoEditorReactComp } from "@typefox/monaco-editor-react";
import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";
import type { EditorAppConfig, TextContents } from "monaco-languageclient/editorApp";
import type { MonacoVscodeApiConfig } from "monaco-languageclient/vscodeApiWrapper";

type MonacoTextEditorProps = {
	value: string;
	language: string;
	path: string;
	onChange: (value: string) => void;
};

const vscodeApiConfig: MonacoVscodeApiConfig = {
	$type: "extended",
	viewsConfig: { $type: "EditorService" },
	userConfiguration: {
		json: JSON.stringify({
			"workbench.colorTheme": "Default Dark Modern",
			"editor.wordBasedSuggestions": "off",
			"editor.minimap.enabled": false,
			"editor.stickyScroll.enabled": false
		})
	},
	monacoWorkerFactory: configureDefaultWorkerFactory
};

function editorLanguage(language: string) {
	return language === "yaml" ? "yaml" : language;
}

export function MonacoTextEditor({ value, language, path, onChange }: MonacoTextEditorProps) {
	const editorAppConfig = useMemo<EditorAppConfig>(() => ({
		codeResources: {
			modified: {
				text: value,
				uri: `file://${path}`,
				enforceLanguageId: editorLanguage(language)
			}
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
			minimap: { enabled: false }
		}
	}), [language, path]);

	function handleTextChanged(changes: TextContents) {
		if (changes.modified !== undefined) onChange(changes.modified);
	}

	return <div className="h-[min(68vh,640px)] min-h-[360px] overflow-hidden rounded-lg border border-border bg-[#1e1e1e]">
		<MonacoEditorReactComp
			vscodeApiConfig={vscodeApiConfig}
			editorAppConfig={editorAppConfig}
			onTextChanged={handleTextChanged}
			onError={(error) => console.error("Monaco editor error", error)}
			style={{ height: "100%", width: "100%" }}
		/>
	</div>;
}

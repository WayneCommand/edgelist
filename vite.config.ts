import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	plugins: [react(), tailwindcss(), cloudflare()],
	worker: { format: "es" },
	resolve: {
		// `@typefox/monaco-editor-react` lists React as a regular dependency rather
		// than a peer, so pnpm installs a second copy under it (19.2.8, against the
		// app's 19.2.1). The production build dedupes that away, but the dev server
		// bundles the nested copy into its pre-bundled chunk, and the editor then
		// calls hooks on a React that `react-dom` is not rendering with — "Invalid
		// hook call" the moment a text file is opened. Deduping pins every importer
		// to the project's copy.
		dedupe: ["react", "react-dom"],
	},
});

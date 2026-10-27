import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { viewportZoomInitScript } from "./src/react-app/lib/viewport-zoom";

/**
 * Puts the adaptive-zoom factor on `<html>` before the first paint.
 *
 * The script has to be inline and blocking; an external module is fetched after
 * the first paint, which is exactly the flash this avoids. Generating it from
 * the same module as the runtime means the constants and the formula have one
 * source, and `viewport-zoom.test.ts` executes the generated script against the
 * pure function so a future edit cannot silently change only one of them.
 */
const viewportZoom: Plugin = {
	name: "edgelist:viewport-zoom",
	transformIndexHtml: {
		order: "pre",
		handler() {
			return [{ tag: "script", children: viewportZoomInitScript(), injectTo: "head" }];
		},
	},
};

export default defineConfig({
	plugins: [react(), tailwindcss(), cloudflare(), viewportZoom],
	worker: { format: "es" },
});

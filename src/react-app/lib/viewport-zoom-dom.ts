import { computeViewportZoom, VIEWPORT_ZOOM_PRECISION } from "./viewport-zoom";

/**
 * The DOM half of adaptive zoom.
 *
 * Keeping this separate from `viewport-zoom.ts` is what lets the Vite config
 * import the pure module and serialize the first-paint script: this file is the
 * only one that touches `window` and `document`.
 */

/** Whether this browser actually applies CSS `zoom` (Firefox only from 126). */
let zoomSupport: boolean | null = null;

export function viewportZoomSupported(): boolean {
	if (zoomSupport === null) {
		zoomSupport =
			typeof window !== "undefined" &&
			typeof CSS !== "undefined" &&
			typeof CSS.supports === "function" &&
			CSS.supports("zoom", "1.5");
	}
	return zoomSupport;
}

/** Applies the computed factor to the two CSS variables. */
export function applyViewportZoom(maxZoom: number): void {
	if (typeof document === "undefined" || typeof window === "undefined") return;
	if (!viewportZoomSupported()) {
		clearViewportZoom();
		return;
	}
	const zoom = computeViewportZoom({
		width: window.innerWidth,
		height: window.innerHeight,
		maxZoom,
	});
	const style = document.documentElement.style;
	style.setProperty("--app-zoom", String(zoom));
	style.setProperty(
		"--app-zoom-inv",
		String(Math.round((zoom ? 1 / zoom : 1) * VIEWPORT_ZOOM_PRECISION) / VIEWPORT_ZOOM_PRECISION),
	);
}

/**
 * Removes the variables rather than writing 1.
 *
 * CSS keeps `var(--app-zoom, 1)` and `var(--app-zoom-inv, 1)` fallbacks, so
 * removing the property is what "adaptive zoom is off" means — there is no
 * value left for another consumer to mistake for an enabled 1× zoom.
 */
export function clearViewportZoom(): void {
	if (typeof document === "undefined") return;
	const style = document.documentElement.style;
	style.removeProperty("--app-zoom");
	style.removeProperty("--app-zoom-inv");
}

/**
 * The current factor, for the few calculations CSS cannot do.
 *
 * Reads the inline variable rather than `getComputedStyle`: it is the value this
 * app wrote, it does not force a style recalculation, and a browser that ignores
 * CSS `zoom` still sees a defined factor (the CSS `@supports` guard keeps such a
 * browser from using it for heights).
 */
export function currentViewportZoom(): number {
	if (typeof document === "undefined" || !viewportZoomSupported()) return 1;
	const value = Number.parseFloat(document.documentElement.style.getPropertyValue("--app-zoom"));
	return Number.isFinite(value) && value > 0 ? value : 1;
}

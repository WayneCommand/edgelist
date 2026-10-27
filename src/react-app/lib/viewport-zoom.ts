/**
 * Global adaptive zoom: the arithmetic, and nothing else.
 *
 * The whole interface is scaled to the design's 1440 × 900 baseline on screens
 * that are larger than it. The factor is the smaller of the width and height
 * ratios, so a wide short window is limited by its height rather than
 * overflowing, and it never goes below 1 — a small window is left alone instead
 * of being shrunk.
 *
 * This module is deliberately free of DOM access: `vite.config.ts` imports it
 * to serialize the first-paint script into `<head>`, and the browser imports it
 * for the runtime. One formula, two consumers.
 */

export const VIEWPORT_ZOOM_BASE_WIDTH = 1440;
export const VIEWPORT_ZOOM_BASE_HEIGHT = 900;
/** Three decimals is finer than a CSS layout can show and avoids long numbers. */
export const VIEWPORT_ZOOM_PRECISION = 1000;
export const MIN_VIEWPORT_ZOOM = 1;
export const DEFAULT_VIEWPORT_ZOOM_MAX = 1.5;
export const MAX_VIEWPORT_ZOOM_MAX = 3;
export const VIEWPORT_ZOOM_MAX_STEP = 0.05;

/**
 * The persistence keys, written by `preferences.ts` and read by the head script
 * before React exists. The names are duplicated there as preference keys; the
 * unit test keeps the two spellings together.
 */
export const VIEWPORT_ZOOM_STORAGE_KEYS = {
	enabled: "edgelist:auto_viewport_zoom",
	max: "edgelist:auto_viewport_zoom_max",
} as const;

/** Clamps a stored ceiling to the range the control offers. */
export function normalizeViewportZoomMax(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_VIEWPORT_ZOOM_MAX;
	return Math.min(MAX_VIEWPORT_ZOOM_MAX, Math.max(MIN_VIEWPORT_ZOOM, value));
}

export function computeViewportZoom(input: { width: number; height: number; maxZoom: number }): number {
	if (!Number.isFinite(input.width) || !Number.isFinite(input.height)) return MIN_VIEWPORT_ZOOM;
	const max = normalizeViewportZoomMax(input.maxZoom);
	const raw = Math.min(input.width / VIEWPORT_ZOOM_BASE_WIDTH, input.height / VIEWPORT_ZOOM_BASE_HEIGHT);
	const bounded = Math.min(Math.max(MIN_VIEWPORT_ZOOM, raw), max);
	return Math.round(bounded * VIEWPORT_ZOOM_PRECISION) / VIEWPORT_ZOOM_PRECISION;
}

/**
 * The synchronous script injected before the first paint.
 *
 * A React effect is too late: the browser would paint the page at 1× and then
 * jump to the computed factor. The script reads the same two localStorage
 * values the preference store writes, computes the same factor and writes the
 * two CSS variables; the stylesheet's `html { zoom: var(--app-zoom, 1) }` does
 * the rest. It is generated rather than hand-written so the constants cannot
 * drift from `computeViewportZoom`.
 *
 * The `try` is not defensive noise: `localStorage` throws in private mode and
 * when storage is disabled, and neither is a reason to break the page.
 */
export function viewportZoomInitScript(): string {
	return `(function(){try{
if(!window.CSS||!window.CSS.supports||!window.CSS.supports("zoom","1.5"))return;
var enabled=localStorage.getItem(${JSON.stringify(VIEWPORT_ZOOM_STORAGE_KEYS.enabled)});
if(enabled==="off")return;
var storedMax=localStorage.getItem(${JSON.stringify(VIEWPORT_ZOOM_STORAGE_KEYS.max)});
var max=storedMax===null?${DEFAULT_VIEWPORT_ZOOM_MAX}:Number(storedMax);
if(!isFinite(max))max=${DEFAULT_VIEWPORT_ZOOM_MAX};
max=Math.min(Math.max(max,${MIN_VIEWPORT_ZOOM}),${MAX_VIEWPORT_ZOOM_MAX});
var zoom=Math.min(window.innerWidth/${VIEWPORT_ZOOM_BASE_WIDTH},window.innerHeight/${VIEWPORT_ZOOM_BASE_HEIGHT});
zoom=Math.min(Math.max(zoom,${MIN_VIEWPORT_ZOOM}),max);
zoom=Math.round(zoom*${VIEWPORT_ZOOM_PRECISION})/${VIEWPORT_ZOOM_PRECISION};
var style=document.documentElement.style;
style.setProperty("--app-zoom",String(zoom));
style.setProperty("--app-zoom-inv",String(zoom?Math.round(${VIEWPORT_ZOOM_PRECISION}/zoom)/${VIEWPORT_ZOOM_PRECISION}:1));
}catch(error){console.warn("viewport.zoom_init_failed",error);}})();`;
}

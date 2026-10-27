import { useEffect } from "react";
import { usePreference } from "../hooks/useStore";
import { applyViewportZoom, clearViewportZoom } from "../lib/viewport-zoom-dom";

/**
 * Keeps the adaptive-zoom CSS variables in step with the window and the setting.
 *
 * Mounted once at the root and renders nothing. The first paint is handled by
 * the synchronous script in `<head>`; this component only answers resizes and
 * setting changes afterwards, and does so through CSS variables rather than
 * React state so a drag never re-renders the tree.
 *
 * The resize handler and the effect both go through one animation frame: a
 * window drag emits events faster than the compositor can use them, and a
 * slider emits a value per pointer move. One layout pass per frame is the most
 * this can usefully do.
 */
export function ViewportZoom() {
	const enabled = usePreference("auto_viewport_zoom") === "on";
	const maxZoom = usePreference("auto_viewport_zoom_max");

	useEffect(() => {
		if (!enabled) {
			clearViewportZoom();
			return;
		}

		let frame = 0;
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = 0;
				applyViewportZoom(maxZoom);
			});
		};

		schedule();
		window.addEventListener("resize", schedule);
		return () => {
			window.removeEventListener("resize", schedule);
			cancelAnimationFrame(frame);
		};
	}, [enabled, maxZoom]);

	return null;
}

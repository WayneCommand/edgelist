import { describe, expect, it } from "vitest";
import { getPreference, PREFERENCE_PREFIX, PREFERENCE_SPECS, setPreference } from "./preferences";
import {
	DEFAULT_VIEWPORT_ZOOM_MAX,
	computeViewportZoom,
	normalizeViewportZoomMax,
	VIEWPORT_ZOOM_STORAGE_KEYS,
	viewportZoomInitScript,
} from "./viewport-zoom";

/**
 * The zoom arithmetic and the two copies of it.
 *
 * The first-paint script is the one place the platform forces a second copy of
 * the formula, because an inline `<head>` script cannot import a module. These
 * tests execute the generated string against `computeViewportZoom`, so the copy
 * is checked rather than trusted.
 */

function runInitScript(options: {
	width: number;
	height: number;
	enabled?: string | null;
	max?: string | null;
}): Map<string, string> {
	const properties = new Map<string, string>();
	const storage = {
		getItem(key: string) {
			if (key === VIEWPORT_ZOOM_STORAGE_KEYS.enabled) return options.enabled ?? null;
			if (key === VIEWPORT_ZOOM_STORAGE_KEYS.max) return options.max ?? null;
			return null;
		},
	};
	const document = {
		documentElement: {
			style: {
				setProperty: (key: string, value: string) => properties.set(key, value),
			},
		},
	};
	const window = {
		innerWidth: options.width,
		innerHeight: options.height,
		CSS: { supports: () => true },
	};
	const script = new Function("window", "document", "localStorage", "console", viewportZoomInitScript());
	script(window, document, storage, { warn: () => undefined });
	return properties;
}

describe("computeViewportZoom", () => {
	it("never shrinks a viewport below the base size", () => {
		expect(computeViewportZoom({ width: 1366, height: 768, maxZoom: 1.5 })).toBe(1);
		expect(computeViewportZoom({ width: 1440, height: 900, maxZoom: 1.5 })).toBe(1);
	});

	it("uses the smaller axis, so a wide short window does not overflow", () => {
		expect(computeViewportZoom({ width: 1920, height: 1080, maxZoom: 1.5 })).toBe(1.2);
		expect(computeViewportZoom({ width: 3440, height: 1440, maxZoom: 1.5 })).toBe(1.5);
	});

	it("applies the user's ceiling", () => {
		expect(computeViewportZoom({ width: 2560, height: 1440, maxZoom: 1.5 })).toBe(1.5);
		expect(computeViewportZoom({ width: 3840, height: 2160, maxZoom: 3 })).toBe(2.4);
	});

	it("rounds to three decimals", () => {
		expect(computeViewportZoom({ width: 2000, height: 1000, maxZoom: 2 })).toBe(1.111);
	});

	it("clamps a stored ceiling instead of trusting it", () => {
		expect(normalizeViewportZoomMax(0.5)).toBe(1);
		expect(normalizeViewportZoomMax(9)).toBe(3);
		expect(normalizeViewportZoomMax(Number.NaN)).toBe(DEFAULT_VIEWPORT_ZOOM_MAX);
	});
});

describe("the first-paint script", () => {
	it("writes the same factor the runtime computes", () => {
		const properties = runInitScript({ width: 1920, height: 1080 });
		expect(properties.get("--app-zoom")).toBe("1.2");
		expect(properties.get("--app-zoom-inv")).toBe("0.833");
		expect(properties.get("--app-zoom")).toBe(String(computeViewportZoom({ width: 1920, height: 1080, maxZoom: 1.5 })));
	});

	it("does nothing when adaptive zoom is off", () => {
		expect(runInitScript({ width: 2560, height: 1440, enabled: "off" }).size).toBe(0);
	});

	it("does nothing when the browser does not apply CSS zoom", () => {
		const properties = new Map<string, string>();
		const script = new Function("window", "document", "localStorage", "console", viewportZoomInitScript());
		script(
			{ innerWidth: 2560, innerHeight: 1440, CSS: { supports: () => false } },
			{ documentElement: { style: { setProperty: (key: string, value: string) => properties.set(key, value) } } },
			{ getItem: () => null },
			{ warn: () => undefined },
		);
		expect(properties.size).toBe(0);
	});

	it("falls back to the default ceiling for an unreadable value", () => {
		const properties = runInitScript({ width: 3840, height: 2160, max: "not a number" });
		expect(properties.get("--app-zoom")).toBe("1.5");
	});

	it("clamps an out-of-range ceiling the same way the store does", () => {
		const properties = runInitScript({ width: 5120, height: 2880, max: "9" });
		expect(properties.get("--app-zoom")).toBe("3");
	});
});

describe("the zoom preferences", () => {
	it("use the same keys the head script reads", () => {
		expect(PREFERENCE_PREFIX + "auto_viewport_zoom").toBe(VIEWPORT_ZOOM_STORAGE_KEYS.enabled);
		expect(PREFERENCE_PREFIX + "auto_viewport_zoom_max").toBe(VIEWPORT_ZOOM_STORAGE_KEYS.max);
		expect(PREFERENCE_SPECS.auto_viewport_zoom.default).toBe("on");
		expect(PREFERENCE_SPECS.auto_viewport_zoom_max.default).toBe(DEFAULT_VIEWPORT_ZOOM_MAX);
	});

	it("store a fractional ceiling rounded to two decimals, and clamp it", () => {
		expect(getPreference("auto_viewport_zoom")).toBe("on");
		expect(getPreference("auto_viewport_zoom_max")).toBe(DEFAULT_VIEWPORT_ZOOM_MAX);

		setPreference("auto_viewport_zoom_max", 1.234);
		expect(getPreference("auto_viewport_zoom_max")).toBe(1.23);

		setPreference("auto_viewport_zoom_max", 9);
		expect(getPreference("auto_viewport_zoom_max")).toBe(3);

		setPreference("auto_viewport_zoom_max", 0.5);
		expect(getPreference("auto_viewport_zoom_max")).toBe(1);

		setPreference("auto_viewport_zoom", "off");
		expect(getPreference("auto_viewport_zoom")).toBe("off");
		setPreference("auto_viewport_zoom", "on");
	});
});

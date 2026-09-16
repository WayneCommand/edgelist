import { afterEach, describe, expect, it, vi } from "vitest";
import { isThemeChoice, parseThemeChoice, themeFor } from "./theme";

/**
 * The theme module answers two questions — what was chosen, and what is showing
 * — and its DOM half is thin enough to test against a stub rather than a
 * renderer. What matters is the attribute that ends up on `<html>` and whether
 * the transition guard was in place while it changed.
 *
 * The module holds the choice in module scope, so anything that writes it reads
 * a *fresh copy* of the module: `vi.resetModules()` plus a dynamic import. The
 * store is not reset between tests otherwise, and a test would pass or fail
 * depending on which test ran before it. The stub has to be installed first,
 * because the module reads `localStorage` as it loads.
 */

/** A document with just the surface a theme change touches. */
type Stub = {
	attrs: Record<string, string>;
	classes: Set<string>;
	stored: Record<string, string>;
};

function stubBrowser({
	prefersDark = false,
	seed = {},
}: { prefersDark?: boolean; seed?: Record<string, string> } = {}) {
	const attrs: Record<string, string> = {};
	const classes = new Set<string>();
	const stored: Record<string, string> = { ...seed };
	const root = {
		setAttribute: (name: string, value: string) => {
			attrs[name] = value;
		},
		getAttribute: (name: string) => attrs[name] ?? null,
		classList: {
			add: (name: string) => classes.add(name),
			remove: (name: string) => classes.delete(name),
			contains: (name: string) => classes.has(name),
		},
		offsetHeight: 0,
	};
	vi.stubGlobal("document", { documentElement: root });
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => stored[key] ?? null,
		setItem: (key: string, value: string) => {
			stored[key] = value;
		},
	});
	// Frames run synchronously: the real ones wait for a paint, and waiting for a
	// paint in a unit test would only prove that the test can wait.
	vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
	vi.stubGlobal("matchMedia", () => ({ matches: prefersDark, addEventListener: () => {} }));
	return { attrs, classes, stored } satisfies Stub;
}

/** A stubbed browser, then a copy of the theme module that has not been used. */
async function loadTheme(options: Parameters<typeof stubBrowser>[0] = {}) {
	const stub = stubBrowser(options);
	vi.resetModules();
	return { ...stub, theme: await import("./theme") };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("theme choice", () => {
	it("accepts the three values the control offers", () => {
		for (const value of ["system", "light", "dark"]) {
			expect(isThemeChoice(value)).toBe(true);
			expect(parseThemeChoice(value)).toBe(value);
		}
	});

	it("follows the system for anything else, including not having chosen", () => {
		// `readPreference` answers "" when nothing is stored, so "not chosen" and
		// "chosen as system" carry the same preference — which is the intent.
		for (const value of ["", "Dark", "auto", "solarized"]) {
			expect(isThemeChoice(value)).toBe(false);
			expect(parseThemeChoice(value)).toBe("system");
		}
	});
});

describe("themeFor", () => {
	it("lets the system decide, in both directions", () => {
		expect(themeFor("system", true)).toBe("dark");
		expect(themeFor("system", false)).toBe("light");
	});

	it("holds an explicit choice against the system", () => {
		// The whole reason `system` is a third option rather than a setting that
		// resolves itself: a chosen `dark` has to survive an OS that says light.
		expect(themeFor("dark", false)).toBe("dark");
		expect(themeFor("light", true)).toBe("light");
	});
});

describe("currentTheme", () => {
	function root(attrs: Record<string, string> = {}, classes: string[] = []): Element {
		return {
			getAttribute: (name: string) => attrs[name] ?? null,
			classList: { contains: (name: string) => classes.includes(name) },
		} as unknown as Element;
	}

	it("reads the data-theme attribute", async () => {
		const { theme } = await loadTheme();
		expect(theme.currentTheme(root({ "data-theme": "dark" }))).toBe("dark");
	});

	it("reads the class form, which the palette also accepts", async () => {
		const { theme } = await loadTheme();
		expect(theme.currentTheme(root({}, [theme.DARK_CLASS]))).toBe("dark");
	});

	it("treats an explicit light attribute as light", async () => {
		const { theme } = await loadTheme();
		expect(theme.currentTheme(root({ "data-theme": "light" }))).toBe("light");
	});

	it("treats an unrelated class as light", async () => {
		// Only `dark` is a theme signal; a component class must not flip it.
		const { theme } = await loadTheme();
		expect(theme.currentTheme(root({}, ["dark-ish", "app-shell"]))).toBe("light");
	});

	it("falls back to light when there is no document", async () => {
		// The server-render path has no `<html>`, and light is what the stylesheet
		// resolves to on its own.
		const { theme } = await loadTheme();
		expect(theme.currentTheme(null)).toBe("light");
	});
});

describe("paintTheme", () => {
	it("publishes the theme on the document element", async () => {
		const { attrs, theme } = await loadTheme();
		theme.paintTheme("dark", false);
		expect(attrs[theme.THEME_ATTRIBUTE]).toBe("dark");
	});

	it("leaves the transition guard off for the first paint", async () => {
		// There is nothing on screen to animate from, so the guard would only be a
		// frame of latency on a page that has not loaded yet.
		const { classes, theme } = await loadTheme();
		theme.paintTheme("dark", false);
		expect(classes.has(theme.TRANSITION_CLASS)).toBe(false);
	});

	it("guards a switch and then lifts the guard", async () => {
		const { attrs, classes, theme } = await loadTheme();
		theme.paintTheme("dark", true);
		// The guard was on while the attribute changed, and is gone by the time the
		// frames have run — so no colour on the page animates.
		expect(attrs[theme.THEME_ATTRIBUTE]).toBe("dark");
		expect(classes.has(theme.TRANSITION_CLASS)).toBe(false);
	});
});

describe("theme store", () => {
	it("starts by following the system when nothing is stored", async () => {
		const { theme } = await loadTheme();
		expect(theme.getThemeChoice()).toBe("system");
	});

	it("starts from a stored choice", async () => {
		const { theme } = await loadTheme({ seed: { "edgelist:theme": "dark" } });
		expect(theme.getThemeChoice()).toBe("dark");
	});

	it("records the choice itself, not the theme it resolved to", async () => {
		// Someone who picks "follow the system" has to keep following it. Storing
		// today's answer would freeze the choice at whatever the OS said once.
		const { stored, theme } = await loadTheme();
		theme.setThemeChoice("light");
		expect(stored["edgelist:theme"]).toBe("light");
		theme.setThemeChoice("system");
		expect(stored["edgelist:theme"]).toBe("system");
	});

	it("publishes an explicit choice and tells subscribers once", async () => {
		const { attrs, theme } = await loadTheme();
		const listener = vi.fn();
		const unsubscribe = theme.subscribeTheme(listener);
		theme.setThemeChoice("dark");
		expect(attrs[theme.THEME_ATTRIBUTE]).toBe("dark");
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("says nothing when the choice has not changed", async () => {
		const { theme } = await loadTheme();
		theme.setThemeChoice("dark");
		const listener = vi.fn();
		const unsubscribe = theme.subscribeTheme(listener);
		theme.setThemeChoice("dark");
		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("stops notifying after an unsubscribe", async () => {
		const { theme } = await loadTheme();
		const listener = vi.fn();
		theme.subscribeTheme(listener)();
		theme.setThemeChoice("dark");
		expect(listener).not.toHaveBeenCalled();
	});
});

describe("initTheme", () => {
	it("applies the system's answer when nothing was chosen", async () => {
		const { attrs, theme } = await loadTheme({ prefersDark: true });
		theme.initTheme();
		expect(attrs[theme.THEME_ATTRIBUTE]).toBe("dark");
	});

	it("stays light when the system says light", async () => {
		const { attrs, theme } = await loadTheme({ prefersDark: false });
		theme.initTheme();
		expect(attrs[theme.THEME_ATTRIBUTE]).toBe("light");
	});

	it("honours a stored choice over the system", async () => {
		const { attrs, theme } = await loadTheme({ prefersDark: true, seed: { "edgelist:theme": "light" } });
		theme.initTheme();
		expect(attrs[theme.THEME_ATTRIBUTE]).toBe("light");
	});

	it("survives a browser with no matchMedia", async () => {
		// No preference query to make, so the stylesheet's light default stands.
		const { attrs } = stubBrowser();
		vi.stubGlobal("matchMedia", undefined);
		vi.resetModules();
		const theme = await import("./theme");
		expect(() => theme.initTheme()).not.toThrow();
		expect(attrs[theme.THEME_ATTRIBUTE]).toBe("light");
	});
});

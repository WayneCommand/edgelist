import { describe, expect, it } from "vitest";
import { currentTheme, DARK_CLASS, THEME_ATTRIBUTE } from "./theme";

/**
 * `currentTheme` answers "what is the document showing" for the one component
 * that has to pick a colour in JavaScript, so what matters is that it agrees
 * with the palette in `index.css`: the dark tokens apply under either
 * `[data-theme="dark"]` or `.dark`, and nothing else counts as dark.
 *
 * The element is stubbed rather than rendered — the decision is pure, and a
 * stub states which signal is present without a DOM to set it up in.
 */
function root(attrs: Record<string, string> = {}, classes: string[] = []): Element {
	return {
		getAttribute: (name: string) => attrs[name] ?? null,
		classList: { contains: (name: string) => classes.includes(name) },
	} as unknown as Element;
}

describe("currentTheme", () => {
	it("reads the data-theme attribute", () => {
		expect(currentTheme(root({ [THEME_ATTRIBUTE]: "dark" }))).toBe("dark");
	});

	it("reads the class form, which the palette also accepts", () => {
		expect(currentTheme(root({}, [DARK_CLASS]))).toBe("dark");
	});

	it("treats an explicit light attribute as light", () => {
		expect(currentTheme(root({ [THEME_ATTRIBUTE]: "light" }))).toBe("light");
	});

	it("treats an unrelated class as light", () => {
		// Only `dark` is a theme signal; a component class must not flip it.
		expect(currentTheme(root({}, ["dark-ish", "app-shell"]))).toBe("light");
	});

	it("falls back to light when there is no document", () => {
		// The server-render and test paths have no `<html>`, and light is what
		// the stylesheet resolves to on its own.
		expect(currentTheme(null)).toBe("light");
	});
});

/**
 * Which theme the interface is rendering in, and which one was asked for.
 *
 * Two different questions live here and they are easy to confuse:
 *
 * - the **choice** is what the user picked, and it has three values, because
 *   "follow the system" is a preference rather than a look;
 * - the **theme** is what is actually on screen, and it has two.
 *
 * The palette in `index.css` keys on two selectors, `[data-theme="dark"]` and
 * `.dark`, and either one is enough for the dark tokens to apply. This module
 * writes the attribute form, and reads both — whichever one set it, the page is
 * dark.
 *
 * The colour scheme is published on `<html>` rather than held in a React context
 * for the same reason the language is: it has to be true before React exists.
 * A dark-theme user would otherwise get a white canvas on every load, because the
 * first paint happens before any component can run. `initTheme` is therefore
 * called from the entry module, and `index.html` repeats the stored-value lookup
 * inline to cover the moment before that module is evaluated.
 */

import { THEME_KEY, readPreference, writePreference } from "./preferences";

export type Theme = "light" | "dark";

/** What the user picked. `system` is a preference, not a third appearance. */
export type ThemeChoice = "light" | "dark" | "system";

/** The order the control offers them in: least specific first. */
export const THEME_CHOICES = ["system", "light", "dark"] as const;

/**
 * Following the system is the default: someone who has already told their
 * operating system they want dark should not have to say it again here.
 */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

/** Where the effective theme is published. CSS and this module agree on it. */
export const THEME_ATTRIBUTE = "data-theme";

/** The class form of the same signal, which the palette also accepts. */
export const DARK_CLASS = "dark";

/**
 * Marks the document while a theme change is being applied. The rule it matches
 * is in `index.css`; it exists so that flipping a theme does not animate every
 * colour on the page from the old value to the new one.
 */
export const TRANSITION_CLASS = "theme-transitioning";

export function isThemeChoice(value: string): value is ThemeChoice {
	return (THEME_CHOICES as readonly string[]).includes(value);
}

/** An unrecognised value (an older build, a hand-edited key) follows the system. */
export function parseThemeChoice(raw: string): ThemeChoice {
	return isThemeChoice(raw) ? raw : DEFAULT_THEME_CHOICE;
}

/**
 * The look a choice means, given what the operating system is asking for. Pure,
 * so the rule can be stated without a browser to ask.
 */
export function themeFor(choice: ThemeChoice, systemPrefersDark: boolean): Theme {
	if (choice === "system") return systemPrefersDark ? "dark" : "light";
	return choice;
}

/** The OS preference, or a light answer where there is nothing to ask. */
function systemPrefersDark(): boolean {
	return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/**
 * The theme in effect according to the document.
 *
 * This is an answer, not a request: it reads what the page is actually showing,
 * so a component that has to choose a colour in JavaScript — the code editor is
 * the only one — cannot end up disagreeing with the CSS beside it.
 *
 * `root` is a parameter so the decision can be made without a DOM, the way
 * `menuPosition` takes a viewport. Anything that is neither dark signal is
 * light, which is what `index.css` resolves to on its own.
 */
export function currentTheme(root?: Element | null): Theme {
	const html = root ?? (typeof document === "undefined" ? null : document.documentElement);
	if (!html) return "light";
	if (html.getAttribute(THEME_ATTRIBUTE) === "dark") return "dark";
	return html.classList.contains(DARK_CLASS) ? "dark" : "light";
}

/**
 * Put a theme on the document.
 *
 * When `suppressTransitions` is set the change is wrapped in the guard class and
 * the guard is held across two frames. The order matters and cannot be
 * rearranged: the class goes on first, the attribute changes underneath it, the
 * new values are forced to be computed, and only then is the guard lifted. Skip
 * the forced reflow and the browser is still holding the old colours when the
 * class comes off — so every colour on the page animates after all, which is the
 * exact thing the guard was added to prevent.
 *
 * The very first paint passes `false`: there is nothing on screen to animate
 * from, and the guard would only add a frame of latency to the loading page.
 */
export function paintTheme(theme: Theme, suppressTransitions: boolean): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	if (suppressTransitions) root.classList.add(TRANSITION_CLASS);
	root.setAttribute(THEME_ATTRIBUTE, theme);
	if (!suppressTransitions) return;

	// Reading a layout property forces style and layout to be recomputed now
	// rather than at the next paint.
	void root.offsetHeight;

	// Two frames, because one only schedules the paint that has still to happen.
	requestAnimationFrame(() => {
		requestAnimationFrame(() => root.classList.remove(TRANSITION_CLASS));
	});
}

let choice: ThemeChoice = parseThemeChoice(readPreference(THEME_KEY, ""));
const listeners = new Set<() => void>();

export function getThemeChoice(): ThemeChoice {
	return choice;
}

export function subscribeTheme(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Record the user's choice, publish it, and tell the subscribers.
 *
 * `system` is stored as itself rather than resolved at this point: someone who
 * picks "follow the system" expects the page to keep following it, and a stored
 * `dark` would freeze tonight's answer into tomorrow.
 */
export function setThemeChoice(next: ThemeChoice): void {
	if (next === choice) return;
	choice = next;
	writePreference(THEME_KEY, next);
	paintTheme(themeFor(next, systemPrefersDark()), true);
	for (const listener of listeners) listener();
}

/**
 * Apply the stored theme before the first render, and keep following the system
 * while the choice is `system`.
 *
 * Called once from the entry module. Idempotent, so calling it twice is safe —
 * it only sets an attribute to the value it already has.
 */
export function initTheme(): void {
	paintTheme(themeFor(choice, systemPrefersDark()), false);

	const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
	if (!query) return;
	query.addEventListener("change", () => {
		// Only while the system is being followed: someone who picked a theme
		// outright does not want the OS to overrule them at dusk.
		if (choice !== "system") return;
		paintTheme(themeFor(choice, query.matches), true);
	});
}

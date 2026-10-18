/**
 * The theme: what the user chose, and what is actually on screen.
 *
 * Two different questions, and confusing them is the usual bug:
 *
 * - the **choice** has three values, because "follow the system" is a preference
 *   rather than a look;
 * - the **theme** has two, and it is what the CSS sees.
 *
 * The palette keys on `[data-theme="dark"]`, so this module writes that attribute
 * on `<html>`. It is published there rather than held in React state because it
 * has to be true before React exists: a dark-theme user would otherwise get a
 * white canvas on every load, since the first paint happens before any component
 * runs. `index.html` repeats the stored lookup inline to cover the moment before
 * this module is evaluated, and `main.tsx` calls `initTheme` before the first
 * render.
 */

import { THEME_KEY, readFlag, writeFlag } from "./preferences";

export type Theme = "light" | "dark";
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/** Following the system is the default — someone who told their OS they want
 * dark should not have to say it again here. */
const DEFAULT_CHOICE: ThemeChoice = "system";

export const THEME_ATTRIBUTE = "data-theme";

/** Holds the document still while a theme change is applied, so flipping a theme
 * does not animate every colour on the page. The rule is in `index.css`. */
const TRANSITION_CLASS = "theme-transitioning";

function isChoice(value: string): value is ThemeChoice {
	return value === "system" || value === "light" || value === "dark";
}

function systemPrefersDark(): boolean {
	return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** The look a choice means, given what the OS is asking for. Pure, so the rule
 * can be stated without a browser. */
export function themeFor(choice: ThemeChoice, prefersDark: boolean): Theme {
	if (choice === "system") return prefersDark ? "dark" : "light";
	return choice;
}

/**
 * Applies a theme.
 *
 * When transitions are suppressed the guard class goes on first, the attribute
 * changes underneath it, the new values are forced to be computed, and only then
 * is the guard lifted across two frames. Skip the forced reflow and the browser is
 * still holding the old colours when the class comes off — so everything animates
 * after all, which is what the guard exists to prevent.
 */
function paint(theme: Theme, suppressTransitions: boolean) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	if (suppressTransitions) root.classList.add(TRANSITION_CLASS);
	root.setAttribute(THEME_ATTRIBUTE, theme);
	if (!suppressTransitions) return;
	void root.offsetHeight;
	requestAnimationFrame(() => {
		requestAnimationFrame(() => root.classList.remove(TRANSITION_CLASS));
	});
}

let choice: ThemeChoice = (() => {
	const stored = readFlag(THEME_KEY) ?? "";
	return isChoice(stored) ? stored : DEFAULT_CHOICE;
})();

const listeners = new Set<() => void>();

export function getThemeChoice(): ThemeChoice {
	return choice;
}

export function getTheme(): Theme {
	return themeFor(choice, systemPrefersDark());
}

export function subscribeTheme(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Records the choice, publishes it and tells the subscribers.
 *
 * `system` is stored as itself rather than resolved now: someone who picks "follow
 * the system" expects the page to keep following it, and a stored `dark` would
 * freeze tonight's answer into tomorrow.
 */
export function setThemeChoice(next: ThemeChoice) {
	if (next === choice) return;
	choice = next;
	writeFlag(THEME_KEY, next);
	paint(themeFor(next, systemPrefersDark()), true);
	for (const listener of listeners) listener();
}

/**
 * Applies the stored theme before the first render and keeps following the system
 * while the choice is `system`. Idempotent, so calling it twice is safe.
 */
export function initTheme() {
	paint(getTheme(), false);
	const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
	query?.addEventListener("change", () => {
		// Only while the system is being followed: someone who picked a theme
		// outright does not want the OS to overrule them at dusk.
		if (choice !== "system") return;
		paint(getTheme(), true);
		for (const listener of listeners) listener();
	});
}

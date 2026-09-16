/**
 * Which theme the interface is rendering in.
 *
 * This is an answer, not a request: it reads what the document is actually
 * showing, so a component that has to choose a colour in JavaScript — the code
 * editor is the only one — cannot end up disagreeing with the CSS beside it.
 *
 * The palette in `index.css` is keyed on two selectors, `[data-theme="dark"]`
 * and `.dark`, and either one is enough for the dark tokens to apply. So both
 * are read here: whichever one set it, the page is dark.
 */

export type Theme = "light" | "dark";

/** Where the effective theme is published. CSS and this module agree on it. */
export const THEME_ATTRIBUTE = "data-theme";

/** The class form of the same signal, which the palette also accepts. */
export const DARK_CLASS = "dark";

/**
 * The theme in effect.
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

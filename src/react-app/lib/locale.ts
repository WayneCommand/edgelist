/**
 * The language, and the translator the non-React half of the app uses.
 *
 * A module-level store rather than React context for the same reason the token
 * store is: the language is needed *outside* the component tree. `lib/` modules
 * build user-facing text — a permission tooltip, a batch summary — and threading a
 * translator through every one of those signatures would touch far more code than
 * the feature is worth.
 *
 * The consequence to be aware of: `t` is not reactive. A component that renders
 * text must also subscribe, which is what `useT` in `hooks/useLocale.ts` is for. A
 * component that calls this `t` without subscribing renders the right language
 * once and then never updates.
 */

import { DEFAULT_LOCALE, isLocale, localeFrom, translate, type Locale, type MessageKey, type MessageParams } from "./i18n";
import { LOCALE_KEY, readFlag, writeFlag } from "./preferences";

/**
 * The language to start in: an explicit choice wins, otherwise the browser's own
 * preference, otherwise English. `readFlag` returns `null` when nothing is stored,
 * which keeps "not chosen" and "chosen as English" distinguishable — the former
 * keeps following the browser.
 */
let locale: Locale = (() => {
	const stored = readFlag(LOCALE_KEY);
	if (isLocale(stored)) return stored;
	return localeFrom(globalThis.navigator?.language);
})();

const listeners = new Set<() => void>();

/**
 * Tells the document which language it is in.
 *
 * `lang` is how a screen reader picks a pronunciation, and how a browser picks
 * line-breaking, hyphenation and CJK font fallback. It has to be on `<html>`, and
 * `index.html` can only hard-code one value — so it is corrected here, on load and
 * on every change.
 */
function applyLang(next: Locale) {
	if (typeof document === "undefined") return;
	document.documentElement.lang = next;
}

applyLang(locale);

export function getLocale(): Locale {
	return locale;
}

export function setLocale(next: Locale) {
	if (next === locale) return;
	locale = next;
	writeFlag(LOCALE_KEY, next);
	applyLang(next);
	for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The message for `key` in the language currently in effect. */
export function t(key: MessageKey, params?: MessageParams): string {
	return translate(locale, key, params);
}

/** Two keys, because English inflects its noun and Chinese does not. */
export function tCount(count: number, one: MessageKey, other: MessageKey): string {
	return t(count === 1 ? one : other, { count });
}

export { DEFAULT_LOCALE };

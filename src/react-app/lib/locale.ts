import {
	DEFAULT_LOCALE,
	isLocale,
	localeFrom,
	translate,
	type Locale,
	type MessageKey,
	type MessageParams,
} from "./i18n";
import { LOCALE_KEY, readPreference, writePreference } from "./preferences";

/**
 * The chosen language, and the translator the non-React half of the app uses.
 *
 * This is a module-level store rather than React context for the same reason
 * `useAuth` is: the language is needed *outside* the component tree. `lib/`
 * modules build user-facing text — a permission tooltip, a batch summary, an
 * upload refusal — and threading a translator through every one of those
 * signatures would touch far more code than the feature is worth. They call
 * `t` and read whatever language is current.
 *
 * The consequence to be aware of: `t` is not reactive. A component that renders
 * text must also subscribe, which is what `useT` and `useLocale` in
 * `hooks/useLocale.ts` are for. A component that calls this `t` without
 * subscribing renders the right language once and then never changes it.
 */

/**
 * The language to start in: an explicit choice wins, otherwise the browser's
 * own preference, otherwise English. `readPreference` returns `""` when nothing
 * has been stored, which `isLocale` rejects — so "not chosen" and "chosen as
 * English" stay distinguishable, and the former keeps following the browser.
 */
function initialLocale(): Locale {
	const stored = readPreference(LOCALE_KEY, "");
	if (isLocale(stored)) return stored;
	return localeFrom(globalThis.navigator?.language);
}

let locale: Locale = initialLocale();
const listeners = new Set<() => void>();

/**
 * Tell the document which language it is in.
 *
 * The `lang` attribute is how a screen reader picks a pronunciation, and how a
 * browser picks line-breaking, hyphenation and font fallback for CJK. It has to
 * be on `<html>` rather than on any element React renders, and `index.html` can
 * only hard-code one value — so it is corrected here, once on load and again
 * whenever the language changes.
 */
function applyLang(next: Locale): void {
	if (typeof document === "undefined") return;
	document.documentElement.lang = next;
}

export function getLocale(): Locale {
	return locale;
}

export function setLocale(next: Locale): void {
	if (next === locale) return;
	locale = next;
	writePreference(LOCALE_KEY, next);
	applyLang(next);
	for (const listener of listeners) listener();
}

// The stored language has to reach the document too, not only the components:
// a page marked `lang="en"` around Chinese text is mispronounced.
applyLang(locale);

export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The message for `key` in the language currently in effect. */
export function t(key: MessageKey, params?: MessageParams): string {
	return translate(locale, key, params);
}

/**
 * Pick between the singular and plural forms.
 *
 * Two keys rather than one, because English inflects the noun and Chinese does
 * not: `{{count}} item` / `{{count}} items` against `{{count}} 个项目`. A
 * plural engine would be a dependency and a rule table for a distinction only
 * one of our two languages makes.
 */
export function tCount(count: number, one: MessageKey, other: MessageKey): string {
	return t(count === 1 ? one : other, { count });
}

export { DEFAULT_LOCALE };

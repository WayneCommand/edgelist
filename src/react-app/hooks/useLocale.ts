import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, translate, type Locale, type Translate } from "../lib/i18n";
import { getLocale, setLocale, subscribe } from "../lib/locale";

export type { Translate };

/**
 * The current language, as React sees it.
 *
 * The store in `lib/locale.ts` is subscribed to rather than read, because a
 * component that renders text has to re-render when the language changes — the
 * module-level `t` it could import instead would return the right string once
 * and then never update.
 *
 * `t` is rebuilt when the language changes and is otherwise stable, so it can
 * safely sit in a dependency array.
 */
export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void; t: Translate } {
	const locale = useSyncExternalStore(
		subscribe,
		getLocale,
		// No SSR here — the app is a client-rendered SPA — but React asks for a
		// server snapshot anyway, and English is the honest answer for one.
		() => DEFAULT_LOCALE,
	);
	const t = useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);
	return { locale, setLocale, t };
}

/** Just the translator, for a component with no other use for the language. */
export function useT(): Translate {
	return useLocale().t;
}

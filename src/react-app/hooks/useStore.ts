/**
 * The three stores React reads, as hooks.
 *
 * Each wraps a module-level store in `useSyncExternalStore`, which is the one hook
 * meant for exactly this: a value that lives outside React but has to re-render a
 * component when it changes. Keeping them here (rather than in each store's own
 * module) is what lets the stores stay plain modules that a unit test can drive
 * without a renderer.
 */

import { useCallback, useSyncExternalStore } from "react";
import { clearToken, getToken, setToken, subscribeToken } from "../lib/api";
import { getLocale, setLocale, subscribeLocale, t, tCount } from "../lib/locale";
import { getTheme, getThemeChoice, setThemeChoice, subscribeTheme } from "../lib/theme";
import {
	translate,
	translateCount,
	type Locale,
	type MessageKey,
	type MessageParams,
	type Translate,
} from "../lib/i18n";

export { usePreference, useLayoutFor, useSortFor } from "../lib/preferences";
export { useWorkspace, driverFor, driverLabel, loadWorkspace, resetWorkspace } from "../lib/workspace";

/**
 * The session.
 *
 * `signOut` clears the token rather than calling the endpoint: the Worker's logout
 * is a no-op that answers `success`, and the only thing that ends a session is the
 * client forgetting the token. That keeps sign-out instant and correct even when
 * the network is not.
 */
export function useAuth() {
	const token = useSyncExternalStore(subscribeToken, getToken, () => "");
	return {
		token,
		signedIn: Boolean(token),
		signIn: setToken,
		signOut: clearToken,
	};
}

export type { Translate };

/** The chosen language, and a translator bound to it. */
export function useLocale() {
	const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
	const t = useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);
	const count = useCallback(
		(n: number, one: MessageKey, other: MessageKey, params?: MessageParams) =>
			translateCount(locale, n, one, other, params),
		[locale],
	);
	return { locale, setLocale, t, count };
}

/** Just the translator, for a component with no other use for the language. */
export function useT(): Translate {
	return useLocale().t;
}

/** The theme in effect, and the choice behind it. */
export function useTheme() {
	const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light" as const);
	const choice = useSyncExternalStore(subscribeTheme, getThemeChoice, getThemeChoice);
	return { theme, choice, setChoice: setThemeChoice };
}

/**
 * The non-reactive translator, for the modules that build text outside React.
 *
 * Exported from the hook module rather than from `lib/locale.ts` so that a
 * component has one obvious place to look, and so that the only consumers of the
 * ambient translator are the few `lib/` functions whose output is a sentence.
 */
export { t, tCount };
export type { Locale };

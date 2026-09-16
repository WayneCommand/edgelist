import { useSyncExternalStore } from "react";
import { DEFAULT_THEME_CHOICE, getThemeChoice, setThemeChoice, subscribeTheme, type ThemeChoice } from "../lib/theme";

/**
 * The chosen theme, as React sees it.
 *
 * The store in `lib/theme.ts` is subscribed to rather than read, so the control
 * shows what is in effect even when the choice was made somewhere else — the
 * only current writer is the control itself, but nothing here assumes that.
 *
 * `setChoice` is handed out as the module-level function rather than wrapped: it
 * is already stable, and a wrapper would only give the control a new identity to
 * re-render over.
 */
export function useTheme(): { choice: ThemeChoice; setChoice: (next: ThemeChoice) => void } {
	const choice = useSyncExternalStore(subscribeTheme, getThemeChoice, () => DEFAULT_THEME_CHOICE);
	return { choice, setChoice: setThemeChoice };
}

import { useT } from "../../hooks/useLocale";
import { useTheme } from "../../hooks/useTheme";
import type { MessageKey } from "../../lib/i18n";
import { isThemeChoice, THEME_CHOICES, type ThemeChoice } from "../../lib/theme";

/**
 * The theme picker.
 *
 * "Follow the system" is offered first because it is the default and the honest
 * answer for most people, and it is offered at all because a two-way switch
 * cannot express it — the stored value would have to guess, and would then stop
 * following the system the moment the OS changed its mind.
 *
 * A `select` rather than a pair of buttons, matching the language picker beside
 * it: both are settings with three or fewer options, and the two controls in the
 * same corner of the same header should be the same kind of thing.
 */
const LABELS: Record<ThemeChoice, MessageKey> = {
	system: "nav.theme.system",
	light: "nav.theme.light",
	dark: "nav.theme.dark",
};

export function ThemeSelect({ className = "" }: { className?: string }) {
	const { choice, setChoice } = useTheme();
	const t = useT();
	return (
		<select
			value={choice}
			aria-label={t("nav.theme")}
			title={t("nav.theme")}
			onChange={(event) => {
				if (isThemeChoice(event.target.value)) setChoice(event.target.value);
			}}
			className={`px-2 py-1 text-xs ${className}`}
		>
			{THEME_CHOICES.map((option) => (
				<option key={option} value={option}>
					{t(LABELS[option])}
				</option>
			))}
		</select>
	);
}

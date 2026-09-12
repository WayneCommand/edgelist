import { isLocale, LOCALES, type Locale } from "../../lib/i18n";
import { useLocale } from "../../hooks/useLocale";

/**
 * The language picker.
 *
 * Each language is named in itself — "English", "中文" — rather than translated
 * into the language currently in effect. That is the convention, and it is the
 * only spelling that helps someone who cannot read the current one.
 */
const LABELS: Record<Locale, string> = { en: "English", zh: "中文" };

export function LocaleSelect({ className = "" }: { className?: string }) {
	const { locale, setLocale, t } = useLocale();
	return (
		<select
			value={locale}
			aria-label={t("nav.switchLanguage")}
			title={t("nav.switchLanguage")}
			onChange={(event) => {
				if (isLocale(event.target.value)) setLocale(event.target.value);
			}}
			className={`rounded-lg border border-border bg-field-background px-2 py-1 text-xs text-foreground outline-none focus:border-focus ${className}`}
		>
			{LOCALES.map((option) => (
				<option key={option} value={option}>
					{LABELS[option]}
				</option>
			))}
		</select>
	);
}

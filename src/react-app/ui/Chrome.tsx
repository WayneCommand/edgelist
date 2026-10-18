import { Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger } from "@heroui/react/dropdown";
import { LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n";
import { useLocale, useTheme } from "../hooks/useStore";
import { Icon, type IconName } from "./Icon";

/**
 * The language picker.
 *
 * Each language is named in itself — "English", "中文" — rather than translated into
 * the language currently in effect. That is the convention, and it is the only
 * spelling that helps someone who cannot read the current one.
 */
export function LocaleMenu() {
	const { locale, setLocale, t } = useLocale();
	return (
		<Dropdown>
			<DropdownTrigger
				className="tap size-8 rounded-lg p-0 text-neutral-11 hover:bg-row-hover hover:text-foreground"
				aria-label={t("toolbar.switch_lang")}
			>
				<Icon name="globe" className="size-4" />
			</DropdownTrigger>
			<DropdownPopover placement="bottom end">
				<DropdownMenu onAction={(key) => setLocale(String(key) as Locale)}>
					{LOCALES.map((option) => (
						<DropdownItem key={option} id={option} textValue={LOCALE_LABELS[option]}>
							<span className="flex items-center justify-between gap-4">
								{LOCALE_LABELS[option]}
								{option === locale && <Icon name="check" className="size-3.5 text-info-10" strokeWidth={2.5} />}
							</span>
						</DropdownItem>
					))}
				</DropdownMenu>
			</DropdownPopover>
		</Dropdown>
	);
}

/**
 * The theme switch.
 *
 * A plain press flips between light and dark, which is the common case and is all
 * §8 and §10.2 draw. The menu behind the caret is where "follow the system" lives:
 * a user who wants the OS's answer back has no other way to ask for it, but it does
 * not deserve a permanent third control.
 */
export function ThemeMenu() {
	const { theme, choice, setChoice } = useTheme();
	const { t } = useLocale();
	return (
		<div className="flex items-center">
			<button
				type="button"
				onClick={() => setChoice(theme === "dark" ? "light" : "dark")}
				aria-label={t("toolbar.toggle_theme")}
				title={t("toolbar.toggle_theme")}
				className="tap flex size-8 items-center justify-center rounded-lg text-neutral-11 hover:bg-row-hover hover:text-foreground"
			>
				<Icon name={theme === "dark" ? "sun" : "moon"} className="size-4" />
			</button>
			<Dropdown>
				<DropdownTrigger
					className="tap flex h-8 items-center rounded-lg px-0.5 text-neutral-9 hover:bg-row-hover hover:text-foreground"
					aria-label={t("toolbar.toggle_theme")}
				>
					<Icon name="chevron-down" className="size-3" />
				</DropdownTrigger>
				<DropdownPopover placement="bottom end">
					<DropdownMenu onAction={(key) => setChoice(String(key) as "system" | "light" | "dark")}>
						{(["system", "light", "dark"] as const).map((option) => (
							<DropdownItem key={option} id={option} textValue={option}>
								<span className="flex items-center justify-between gap-4">
									{t(`local.${option}` as "local.system")}
									{option === choice && <Icon name="check" className="size-3.5 text-info-10" strokeWidth={2.5} />}
								</span>
							</DropdownItem>
						))}
					</DropdownMenu>
				</DropdownPopover>
			</Dropdown>
		</div>
	);
}

/**
 * The EdgeList mark: a rounded tile with an E in it.
 *
 * The radius is a quarter of the tile, as a percentage rather than a pixel value, so
 * one number stays correct at every size. The letter is decoration wherever it
 * appears — the wordmark sits beside it, or the heading below it — so it is hidden
 * from assistive technology rather than read out as a stray "E".
 */
export function LogoMark({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
	const box = size === "sm" ? "size-8" : size === "md" ? "size-10" : "size-14";
	const text = size === "sm" ? "text-sm" : size === "md" ? "text-base" : "text-2xl";
	return (
		<span
			aria-hidden="true"
			className={`flex shrink-0 items-center justify-center rounded-[25%] bg-foreground font-bold text-background ${box} ${text}`}
		>
			E
		</span>
	);
}

/** The mark plus the product name, used in both shells. */
export function Wordmark({ onClick }: { onClick?: () => void }) {
	return (
		<button type="button" onClick={onClick} className="tap flex items-center gap-2.5 rounded-lg" aria-label="EdgeList">
			<LogoMark />
			<span className="text-[15px] font-semibold tracking-tight">EdgeList</span>
		</button>
	);
}

/**
 * One entry in a dropdown menu: glyph, label, and an optional danger tone.
 *
 * The library's `DropdownItem` takes children, so this is a content shape rather
 * than a component — the menus in this app are built from arrays of these, which
 * keeps a menu's items readable as a list instead of as eight levels of nesting.
 */
export type MenuEntry = {
	id: string;
	label: string;
	icon?: IconName;
	/** Renders the label and glyph in the danger colour. */
	danger?: boolean;
	/** A key hint drawn on the right, e.g. `⌘S`. */
	hint?: string;
};

export function MenuEntries({ entries, onAction }: { entries: MenuEntry[]; onAction: (id: string) => void }) {
	return (
		<DropdownMenu onAction={(key) => onAction(String(key))}>
			{entries.map((entry) => (
				<DropdownItem
					key={entry.id}
					id={entry.id}
					textValue={entry.label}
					className={entry.danger ? "text-danger-11" : undefined}
				>
					<span className="flex w-full items-center gap-2">
						{entry.icon && <Icon name={entry.icon} className="size-4 shrink-0" />}
						<span className="flex-1">{entry.label}</span>
						{entry.hint && <span className="text-[11px] text-neutral-9">{entry.hint}</span>}
					</span>
				</DropdownItem>
			))}
		</DropdownMenu>
	);
}

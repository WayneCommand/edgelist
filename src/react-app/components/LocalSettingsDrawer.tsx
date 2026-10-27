import { Drawer } from "@heroui/react/drawer";
import { PREFERENCE_ORDER, PREFERENCE_SPECS, setPreference, type PreferenceKey } from "../lib/preferences";
import { MAX_VIEWPORT_ZOOM_MAX, MIN_VIEWPORT_ZOOM, VIEWPORT_ZOOM_MAX_STEP } from "../lib/viewport-zoom";
import { usePreference, useT, useTheme } from "../hooks/useStore";
import { Icon } from "../ui/Icon";
import { LocaleMenu, ThemeMenu } from "../ui/Chrome";
import { NumberStepper, Select, Switch, TextInput } from "../ui/Field";

/**
 * The local settings drawer (§8).
 *
 * The §8 settings, and the drawer mostly is a loop over them: §8 gives each one a
 * label, a control type, its options and its default, and `preferences.ts` states that
 * as a schema. The adaptive-zoom pair is the exception — a fractional ceiling wants a
 * slider, not the whole-numbered stepper — so it is one small hand-drawn section above
 * the generated rows.
 *
 * Everything is applied on change and persisted immediately — there is no Save button,
 * which is what §8 asks for. That works because every reader subscribes to the store
 * rather than reading it once: dragging the grid size re-renders the grid as it moves.
 *
 * No placeholder "Choose": §8's own text says the dropdowns show one, but a select
 * whose value is always one of the options has nothing to be empty about, and one
 * whose value was coerced on read (see `coerce`) can never be empty either. The
 * placeholder would be a state the store cannot represent.
 */
export function LocalSettingsDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
	const t = useT();
	const { theme } = useTheme();

	return (
		<Drawer>
			<Drawer.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
				<Drawer.Content placement="right">
					<Drawer.Dialog className="w-[min(24rem,100vw)]">
						<Drawer.Header>
							<Drawer.Heading className="text-base font-semibold text-info-11">
								{t("toolbar.local_settings")}
							</Drawer.Heading>
							<Drawer.CloseTrigger />
						</Drawer.Header>
						<Drawer.Body className="flex flex-col gap-3">
							<ViewportZoomSetting />
							<div className="h-px bg-hairline" />
							{PREFERENCE_ORDER.map((key) => (
								<SettingRow key={key} setting={key} />
							))}
						</Drawer.Body>
						<Drawer.Footer className="justify-center gap-4 border-t border-hairline py-2 text-neutral-11">
							<LocaleMenu />
							<ThemeMenu />
							<span className="text-[11px]">{theme === "dark" ? t("local.dark") : t("local.light")}</span>
						</Drawer.Footer>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}

/**
 * Adaptive zoom, drawn as a switch and a range rather than a generic row.
 *
 * The maximum is a fractional value (`1.5`), and the shared stepper deliberately
 * works in whole numbers; a separate control is smaller than widening that
 * component for one caller. The slider is the interaction the setting wants
 * anyway — dragging it shows the result immediately, because the zoom component
 * writes CSS variables instead of re-rendering the page.
 */
function ViewportZoomSetting() {
	const t = useT();
	const enabled = usePreference("auto_viewport_zoom") === "on";
	const maxZoom = usePreference("auto_viewport_zoom_max");

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[13px] font-medium text-neutral-11">{t("local.auto_viewport_zoom")}</span>
				<Switch
					checked={enabled}
					aria-label={t("local.auto_viewport_zoom")}
					onChange={(next) => setPreference("auto_viewport_zoom", next ? "on" : "off")}
				/>
			</div>

			<div className={`flex flex-col gap-1.5 ${enabled ? "" : "opacity-50"}`}>
				<div className="flex items-center justify-between text-[12px] text-neutral-10">
					<span>{t("local.auto_viewport_zoom_max")}</span>
					<span className="numeric tabular-nums">{maxZoom.toFixed(2)}×</span>
				</div>
				<input
					// The app's field styling is for text boxes; a range keeps the
					// platform's own track and thumb.
					data-plain
					type="range"
					min={MIN_VIEWPORT_ZOOM}
					max={MAX_VIEWPORT_ZOOM_MAX}
					step={VIEWPORT_ZOOM_MAX_STEP}
					value={maxZoom}
					disabled={!enabled}
					aria-label={t("local.auto_viewport_zoom_max")}
					onChange={(event) => setPreference("auto_viewport_zoom_max", Number(event.target.value))}
					className="h-4 w-full cursor-pointer accent-[var(--info-9)] disabled:cursor-not-allowed"
				/>
				<p className="text-[11px] leading-snug text-neutral-10">{t("local.auto_viewport_zoom_hint")}</p>
			</div>
		</div>
	);
}

/**
 * One setting: a label above its control.
 *
 * The value is read through `usePreference` so a change anywhere — including the
 * editor's own toolbar, which writes the same two editor settings — is reflected here
 * without this drawer holding a copy.
 */
function SettingRow({ setting }: { setting: PreferenceKey }) {
	const t = useT();
	const value = usePreference(setting);
	const spec = PREFERENCE_SPECS[setting];

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-[13px] font-medium text-neutral-11">{t(spec.label as never)}</span>
			{spec.kind === "number" ? (
				<NumberStepper
					value={Number(value)}
					min={spec.min}
					max={spec.max ?? 999}
					label={t(spec.label as never)}
					onChange={(next) => setPreference(setting, next as never)}
				/>
			) : spec.kind === "enum" ? (
				<Select
					size="sm"
					value={String(value)}
					aria-label={t(spec.label as never)}
					onChange={(event) => setPreference(setting, event.target.value as never)}
				>
					{spec.options.map((option) => (
						<option key={option.value} value={option.value}>
							{t(option.label as never)}
						</option>
					))}
				</Select>
			) : (
				<TextInput
					size="sm"
					value={String(value)}
					aria-label={t(spec.label as never)}
					onChange={(event) => setPreference(setting, event.target.value as never)}
					// A secret is not rendered in clear text even in a local
					// preference: the drawer is on screen, not in a privacy bubble.
					type={setting === "aria2_rpc_secret" ? "password" : "text"}
				/>
			)}
		</div>
	);
}

/**
 * The two buttons §6.1 puts in the floating cluster that this drawer answers for.
 *
 * Exported so the cluster can render the same pair without a second implementation.
 */
export function SettingsDrawerTrigger({ onPress }: { onPress: () => void }) {
	const t = useT();
	return (
		<button
			type="button"
			onClick={onPress}
			aria-label={t("toolbar.local_settings")}
			title={t("toolbar.local_settings")}
			className="tap flex size-8 items-center justify-center rounded-lg text-muted hover:bg-main hover:text-white"
		>
			<Icon name="settings" className="size-4" />
		</button>
	);
}

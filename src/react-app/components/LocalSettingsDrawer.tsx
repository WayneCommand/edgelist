import { Drawer } from "@heroui/react/drawer";
import { PREFERENCE_ORDER, PREFERENCE_SPECS, setPreference, type PreferenceKey } from "../lib/preferences";
import { usePreference, useT, useTheme } from "../hooks/useStore";
import { Icon } from "../ui/Icon";
import { LocaleMenu, ThemeMenu } from "../ui/Chrome";
import { NumberStepper, Select, TextInput } from "../ui/Field";

/**
 * The local settings drawer (§8).
 *
 * Fourteen settings, and the drawer is a loop over them: §8 gives each one a label, a
 * control type, its options and its default, and `preferences.ts` states that as a
 * schema. So this file has no per-setting code at all, only the three controls the
 * types name.
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
				<Drawer.Content placement="right" className="w-[min(24rem,100vw)]">
					<Drawer.Header>
						<Drawer.Heading className="text-base font-semibold text-info-11">
							{t("toolbar.local_settings")}
						</Drawer.Heading>
						<Drawer.CloseTrigger />
					</Drawer.Header>
					<Drawer.Body className="flex flex-col gap-3">
						{PREFERENCE_ORDER.map((key) => (
							<SettingRow key={key} setting={key} />
						))}
					</Drawer.Body>
					<Drawer.Footer className="justify-center gap-4 border-t border-hairline py-2 text-neutral-11">
						<LocaleMenu />
						<ThemeMenu />
						<span className="text-[11px]">{theme === "dark" ? t("local.dark") : t("local.light")}</span>
					</Drawer.Footer>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
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

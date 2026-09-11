import { Switch as HeroSwitch } from "@heroui/react";

export function StorageToggle({
	label,
	checked,
	onChange,
	disabled = false,
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<HeroSwitch
			isSelected={checked}
			isDisabled={disabled}
			onChange={onChange}
			className={`flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm ${disabled ? "cursor-not-allowed bg-surface-secondary text-muted" : ""}`}
		>
			<span>{label}</span>
		</HeroSwitch>
	);
}

import { humanize, selectOptions, type DriverItem } from "../../lib/drivers";
import { useT } from "../../hooks/useLocale";

type DriverFieldProps = {
	item: DriverItem;
	value: string | number | boolean;
	onChange: (value: string | number | boolean) => void;
};

// Layout only. The skin — radius, field background, border, focus ring — comes
// from the one recipe in `index.css`, which is what keeps this control and the
// hand-written fields on the other pages looking the same.
const CONTROL_CLASS = "w-full px-3 py-2 text-sm";

/**
 * One field of a storage form, chosen by the item's declared type. The registry
 * decides what a driver needs; this component only decides how each type looks,
 * which is why a driver added on the worker side appears here with no change.
 */
export function DriverField({ item, value, onChange }: DriverFieldProps) {
	return (
		<label className="block text-sm">
			<span className="mb-1.5 block font-medium text-foreground">
				{humanize(item.name)}
				{item.required && <span className="ml-1 text-danger">*</span>}
			</span>
			<Control item={item} value={value} onChange={onChange} />
			{item.help && <span className="mt-1 block text-xs text-muted">{item.help}</span>}
		</label>
	);
}

function Control({ item, value, onChange }: DriverFieldProps) {
	const t = useT();
	if (item.type === "bool") {
		// A checkbox rather than a switch: the value is written into a JSON blob
		// that OpenList reads back, so it stays a plain boolean either way.
		return (
			<span className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={value === true}
					aria-label={humanize(item.name)}
					onChange={(event) => onChange(event.target.checked)}
				/>
				<span className="text-xs text-muted">{value === true ? t("storages.enabled") : t("storages.disabled")}</span>
			</span>
		);
	}
	if (item.type === "select") {
		return (
			<select
				value={String(value)}
				required={item.required}
				aria-label={humanize(item.name)}
				className={CONTROL_CLASS}
				onChange={(event) => onChange(event.target.value)}
			>
				{selectOptions(item).map((option) => (
					<option key={option} value={option}>
						{option || t("storages.upstreamOrder")}
					</option>
				))}
			</select>
		);
	}
	if (item.type === "text") {
		return (
			<textarea
				rows={3}
				value={String(value)}
				required={item.required}
				aria-label={humanize(item.name)}
				className={CONTROL_CLASS}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	}
	return (
		<input
			// `number` still submits a string, so the value is coerced on change
			// rather than on read: the stored JSON must hold a number, not "4".
			type={item.type === "number" ? "number" : item.secret ? "password" : "text"}
			value={String(value)}
			required={item.required}
			aria-label={humanize(item.name)}
			autoComplete={item.secret ? "new-password" : "off"}
			className={CONTROL_CLASS}
			onChange={(event) => onChange(item.type === "number" ? Number(event.target.value) : event.target.value)}
		/>
	);
}

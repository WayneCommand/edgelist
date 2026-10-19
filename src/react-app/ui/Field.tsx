import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Form controls, with the label-above-control arrangement every form in §7, §9 and
 * §12 uses.
 *
 * A hand-written `<input>` rather than HeroUI's `Input` for one reason: the spec's
 * fields are *filled* — a neutral-3 well with no border until focus (§2.4) —
 * while the library's default is a white field with a shadow. The recipe lives in
 * `index.css` under `:where(input, select, textarea)`, so a plain element and a
 * library component end up the same shape; using the plain element keeps the small
 * variants (a `sm` field inside a modal, an inline field in a toolbar) from
 * fighting a component that has its own idea of height.
 *
 * `Field` is the wrapper: a label, a control, and either a hint or an error
 * underneath. It offers an `id` through a render prop so the label can point at
 * the control with `htmlFor` — an accessible name is the whole reason to have a
 * label element at all, and a wrapper that could not connect the two would be
 * decoration.
 */
export function Field({
	label,
	hint,
	error,
	fieldId,
	children,
	className = "",
	required,
}: {
	label: ReactNode;
	hint?: ReactNode;
	error?: ReactNode;
	/** Overrides the generated id, for a caller that already owns one. */
	fieldId?: string;
	children: (id: string) => ReactNode;
	className?: string;
	required?: boolean;
}) {
	const generated = useId();
	const id = fieldId ?? `field-${generated}`;
	return (
		<div className={`flex flex-col gap-1.5 ${className}`}>
			<label htmlFor={id} className="text-[12px] font-medium tracking-[0.01em] text-neutral-10">
				{label}
				{required && <span className="ml-0.5 text-danger-9">*</span>}
			</label>
			{children(id)}
			{error ? (
				<p role="alert" className="text-xs text-danger-11">
					{error}
				</p>
			) : hint ? (
				<p className="text-xs leading-relaxed text-neutral-10">{hint}</p>
			) : null}
		</div>
	);
}

const INPUT_SIZE = {
	sm: "h-8 px-2.5 text-[13px]",
	md: "h-10 px-3 text-sm",
} as const;

export function TextInput({
	size = "md",
	className = "",
	...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
	size?: "sm" | "md";
	/** React 19 passes `ref` as a prop; the type needs to say so. */
	ref?: React.Ref<HTMLInputElement>;
}) {
	return <input {...props} className={`w-full ${INPUT_SIZE[size]} ${className}`} />;
}

export function TextArea({ className = "", rows = 4, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea rows={rows} {...props} className={`w-full resize-y px-3 py-2 text-sm break-all ${className}`} />;
}

/**
 * A native `<select>`, styled to match the fields beside it.
 *
 * Deliberately native rather than the library's `Select`: every dropdown in this
 * interface is a short fixed list, and the platform's own popup is faster, ships
 * nothing, and is the one list every keyboard and screen reader already knows.
 * The library's `Select` is used where a *searchable* list is needed, which is the
 * storage driver picker.
 */
export function Select({
	size = "md",
	className = "",
	children,
	...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: "sm" | "md" }) {
	return (
		<select
			{...props}
			className={`w-full appearance-none bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat pr-8 ${INPUT_SIZE[size]} ${className}`}
			style={{
				// The chevron is a data URI so the control needs no extra element and
				// no icon font; `currentColor` cannot be used inside a background, so
				// it is the muted grey that reads correctly in both themes.
				backgroundImage:
					"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23687076' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9.5 12 15.5 18 9.5'/%3E%3C/svg%3E\")",
			}}
		>
			{children}
		</select>
	);
}

/**
 * A checkbox with its label to the right.
 *
 * A real `<input type="checkbox">` because it has `indeterminate`, native keyboard
 * behaviour and native form semantics; a custom control would have to rebuild all
 * three. `accent-color` in `index.css` is what colours it.
 */
export function Checkbox({
	checked,
	indeterminate,
	onChange,
	label,
	disabled,
	className = "",
	labelClassName = "",
}: {
	checked: boolean;
	indeterminate?: boolean;
	onChange: (checked: boolean) => void;
	label?: ReactNode;
	disabled?: boolean;
	className?: string;
	labelClassName?: string;
}) {
	return (
		<label
			className={`inline-flex cursor-pointer items-center gap-2 text-sm select-none ${
				disabled ? "cursor-not-allowed opacity-50" : ""
			} ${className}`}
		>
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onChange(event.target.checked)}
				ref={(node) => {
					if (node) node.indeterminate = Boolean(indeterminate) && !checked;
				}}
				className="size-4 shrink-0 rounded-sm"
			/>
			{label && <span className={labelClassName}>{label}</span>}
		</label>
	);
}

/**
 * A switch.
 *
 * A `<button role="switch">` rather than a checkbox: the two are different
 * affordances in the spec's own vocabulary (§2.4 lists both), and a switch commits
 * on press with no separate save. `aria-checked` is what makes it a switch to
 * assistive technology.
 */
export function Switch({
	checked,
	onChange,
	label,
	disabled,
	className = "",
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label?: ReactNode;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<label className={`inline-flex cursor-pointer items-center gap-2.5 select-none ${className}`}>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={`tint relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] disabled:opacity-50 ${
					checked ? "bg-info-9" : "bg-neutral-6"
				}`}
			>
				<span
					className={`block size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
						checked ? "translate-x-4" : "translate-x-0"
					}`}
				/>
			</button>
			{label && <span className="text-sm">{label}</span>}
		</label>
	);
}

/**
 * A number stepper: `[−] [value] [+]`, attached.
 *
 * §2.4 asks for the three parts to touch and for the native spinners to be hidden;
 * the bounds live with the setting (`preferences.ts`) so the stepper cannot offer a
 * value the store would clamp away.
 */
export function NumberStepper({
	value,
	onChange,
	min,
	max,
	label,
	className = "",
}: {
	value: number;
	onChange: (value: number) => void;
	min: number;
	max: number;
	label: string;
	className?: string;
}) {
	const clamp = (next: number) => Math.min(max, Math.max(min, Math.trunc(next)));
	return (
		<div className={`inline-flex items-stretch ${className}`}>
			<button
				type="button"
				aria-label={`${label} −`}
				disabled={value <= min}
				onClick={() => onChange(clamp(value - 1))}
				className="tap flex size-8 items-center justify-center rounded-l-lg bg-neutral-3 text-neutral-11 hover:bg-neutral-4 disabled:opacity-40"
			>
				<Icon name="minus" className="size-3.5" />
			</button>
			<input
				type="number"
				aria-label={label}
				value={value}
				min={min}
				max={max}
				onChange={(event) => onChange(clamp(Number(event.target.value)))}
				className="h-8 w-14 rounded-none border-x-0 bg-neutral-3 px-1 text-center text-[13px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			/>
			<button
				type="button"
				aria-label={`${label} +`}
				disabled={value >= max}
				onClick={() => onChange(clamp(value + 1))}
				className="tap flex size-8 items-center justify-center rounded-r-lg bg-neutral-3 text-neutral-11 hover:bg-neutral-4 disabled:opacity-40"
			>
				<Icon name="plus" className="size-3.5" />
			</button>
		</div>
	);
}

/**
 * A small status pill (§2.4).
 *
 * The five colours are the four semantic ones plus neutral, and the *tone* names
 * the meaning rather than the hue, so a "success" chip cannot quietly become blue
 * when the palette is retuned.
 */
export type ChipTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const CHIP: Record<ChipTone, string> = {
	neutral: "bg-neutral-3 text-neutral-11",
	info: "bg-info-3 text-info-11",
	success: "bg-success-3 text-success-11",
	warning: "bg-warning-3 text-warning-11",
	danger: "bg-danger-3 text-danger-11",
	accent: "bg-accent-3 text-accent-11",
};

export function Chip({
	tone = "neutral",
	children,
	className = "",
}: {
	tone?: ChipTone;
	children: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap ${CHIP[tone]} ${className}`}
		>
			{children}
		</span>
	);
}

/**
 * A thin progress bar (§2.4: track `info-3`, radius full, fill `info-6`).
 *
 * The fill turns red below 10% remaining, which is §4.2's rule for a disk-usage
 * bar and the reason `capacity` exists as a separate component rather than a
 * generic `Progress` with a `color` prop: this one *decides* its own colour from
 * how full it is, and an option to override it would be an option to lie.
 */
export function Progress({
	value,
	max = 100,
	size = "md",
	label,
	className = "",
}: {
	value: number;
	max?: number;
	size?: "sm" | "md";
	label?: string;
	className?: string;
}) {
	const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
	return (
		<div
			role="progressbar"
			aria-valuenow={Math.round(percent)}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label={label}
			className={`w-full overflow-hidden rounded-full bg-info-3 ${size === "sm" ? "h-1" : "h-1.5"} ${className}`}
		>
			<div
				className="h-full rounded-md bg-info-6 transition-[width] duration-300 ease-out"
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}

/**
 * A capacity bar for a mount point (§4.2).
 *
 * Not a `Progress` with a colour: the percentage is *used/total*, and the fill goes
 * red when what is *left* falls under 10%. Those are different quantities and
 * reading one as the other is the bug this component exists to prevent.
 */
export function CapacityBar({
	used,
	total,
	label,
	className = "",
}: {
	used: number;
	total: number;
	label: string;
	className?: string;
}) {
	const percent = total <= 0 ? 0 : Math.min(100, (used / total) * 100);
	const almostFull = total > 0 && (total - used) / total < 0.1;
	return (
		<div className={`w-full overflow-hidden rounded-full bg-info-3 ${className}`} title={label}>
			<div
				className={`h-1.5 rounded-md ${almostFull ? "bg-danger-9" : "bg-info-6"}`}
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}

/** A centred spinner, for a block that is loading. */
export function Loading({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
	const box = size === "sm" ? "size-3.5 border-2" : size === "lg" ? "size-8 border-[3px]" : "size-5 border-2";
	return (
		<span
			role="status"
			aria-label="Loading"
			className={`inline-block animate-spin rounded-full border-neutral-5 border-t-info-9 ${box} ${className}`}
		/>
	);
}

/**
 * An empty state, an error, or an explanation.
 *
 * One component because they are one shape: a centred block with a glyph, a line of
 * text and an optional action. `tone` decides the glyph's colour, so an error reads
 * as one without a second component.
 */
export function StateMessage({
	icon,
	title,
	description,
	action,
	tone = "neutral",
	className = "",
}: {
	icon?: IconName;
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	tone?: "neutral" | "danger" | "info";
	className?: string;
}) {
	const colour = tone === "danger" ? "text-danger-9" : tone === "info" ? "text-info-9" : "text-neutral-8";
	return (
		<div className={`flex flex-col items-center gap-3 px-6 py-12 text-center ${className}`}>
			{icon && <Icon name={icon} className={`size-8 ${colour}`} strokeWidth={1.25} />}
			<p className="text-sm font-medium text-neutral-11">{title}</p>
			{description && <p className="max-w-md text-xs leading-relaxed text-neutral-10">{description}</p>}
			{action}
		</div>
	);
}

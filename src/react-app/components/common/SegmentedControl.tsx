/**
 * A small set of mutually exclusive options, shown as buttons.
 *
 * Three copies of this existed — the view mode, the paging mode and the
 * markdown view — and they had drifted in the one place that matters. All three
 * marked the chosen option with `text-accent` on `bg-accent-soft`, but the
 * library ships `--accent-soft-foreground` for exactly that pairing, and it is
 * the value the nav and the directory tree already use. So the same state was
 * drawn two ways, and the segmented version was the lower-contrast one.
 *
 * The geometry is the concentric one the three copies already agreed on:
 * `rounded-lg` and a 2px inset leaves 6px for the inner corner, which is
 * `rounded-md`. That pairing was called out as correct and is kept as-is.
 *
 * The label weight is deliberately uniform. Making the selected option
 * semibold would be a nicer emphasis and would also widen it by a pixel or two,
 * so the row would twitch every time it was used.
 */

type SegmentedOption<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
	/** Names the group for a screen reader, since there is no visible label. */
	ariaLabel: string;
	value: T;
	options: ReadonlyArray<SegmentedOption<T>>;
	onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ ariaLabel, value, options, onChange }: SegmentedControlProps<T>) {
	return (
		<div
			role="group"
			aria-label={ariaLabel}
			className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
		>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
					className={`tap rounded-md px-2 py-1 text-xs ${
						value === option.value ? "bg-accent-soft text-accent-soft-foreground" : "text-muted hover:text-foreground"
					}`}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

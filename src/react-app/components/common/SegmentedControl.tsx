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
 * The geometry is the concentric one the three copies already agreed on, with
 * the arithmetic re-run for `--radius: 0.375rem`: the shell rounds at
 * `--radius-lg` (6px) and insets by `p-0.5` (2px) *inside a 1px border*, so the
 * option's corner has 6 − 1 − 2 = 3px to live in and takes it as an arbitrary
 * value. The border is the easy part to drop from the sum — it is drawn inside
 * the box, so it eats a pixel of the corner alongside the padding.
 * `rounded-md` (4.5px) would be 1.5px deeper than that leaves room for.
 *
 * The two ways to miss are not equal. Deeper than outer-minus-inset is a
 * near-miss at being concentric, and a near-miss reads as "not lined up" where
 * a clear difference reads as "deliberately inset" — and carried far enough it
 * stops being subtle, which is what the library's old button was (24px on a
 * 36px control, clamped by CSS to a capsule). Shallower is the conventional
 * direction and is fine in small doses: a row that sits under its own panel
 * without chasing its curve reads as its own shape, inset. What neither
 * direction does is cross the panel's arc — the inset alone rules that out — so
 * this is a question of the band being even, not of overlapping.
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
					className={`tap rounded-[3px] px-2 py-1 text-xs ${
						value === option.value ? "bg-accent-soft text-accent-soft-foreground" : "text-muted hover:text-foreground"
					}`}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

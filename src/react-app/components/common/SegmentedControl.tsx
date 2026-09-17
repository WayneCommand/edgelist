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
 * the arithmetic re-run after `--radius` dropped to 5px: `rounded-lg` (5px) less
 * the `p-0.5` inset (2px) leaves 3px, so the inner corner is `rounded-[3px]`.
 * It used to be `rounded-md`, which was right when `--radius-lg` was 8px and
 * `--radius-md` was 6px; after the change `rounded-md` is 3.75px, i.e. 0.75px
 * deeper than the inset leaves room for.
 *
 * The two ways to miss are not equal. Deeper than outer-minus-inset is a
 * near-miss at being concentric, and a near-miss reads as "not lined up" where
 * a clear difference reads as "deliberately inset" — and carried far enough it
 * stops being subtle, which is what the library's old button was (15px on a
 * 36px control, clamped by CSS to a capsule). Shallower is the conventional
 * direction and is fine in small doses: the library's own menu row sits 1px
 * under its own panel and reads as its own shape, inset. What neither direction
 * does is cross the panel's arc — the inset alone rules that out — so this is a
 * question of the band being even, not of overlapping.
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

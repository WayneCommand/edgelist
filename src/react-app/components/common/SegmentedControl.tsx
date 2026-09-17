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
 *
 * There are two sizes and one shell. `size` changes the option's height and
 * type — `sm` is the inline size the original three callers already had, `md`
 * is what the app shell's navigation takes — and deliberately touches neither
 * the shell's radius nor its inset. So the concentric pair above is the same
 * arithmetic at both sizes, and the guard in `geometry.test.ts` needs one row
 * for it rather than one per size. A size tier that moved the inset would make
 * that row describe only the size it was written for, which is the kind of
 * silent divergence nothing else here would catch; `brand-views.test.tsx` pins
 * the shell's opening tag against it.
 */

type SegmentedOption<T extends string> = { value: T; label: string };

type SegmentedControlSize = "sm" | "md";

/**
 * The option's own box: height and type only. The padding *inside* the shell
 * belongs to the shell, not to the option, which is what keeps the concentric
 * pair fixed across sizes.
 */
const OPTION_SIZE: Record<SegmentedControlSize, string> = {
	sm: "px-2 py-1 text-xs",
	md: "h-7 px-3 text-[13px]",
};

type SegmentedControlProps<T extends string> = {
	/** Names the group for a screen reader, since there is no visible label. */
	ariaLabel: string;
	value: T;
	options: ReadonlyArray<SegmentedOption<T>>;
	onChange: (value: T) => void;
	/** `sm` is the inline size; `md` is the toolbar one. Defaults to `sm`. */
	size?: SegmentedControlSize;
};

export function SegmentedControl<T extends string>({
	ariaLabel,
	value,
	options,
	onChange,
	size = "sm",
}: SegmentedControlProps<T>) {
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
					className={`tap rounded-[3px] ${OPTION_SIZE[size]} ${
						value === option.value ? "bg-accent-soft text-accent-soft-foreground" : "text-muted hover:text-foreground"
					}`}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

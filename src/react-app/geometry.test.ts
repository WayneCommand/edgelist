import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The concentric pairs, checked against the knob they scale from.
 *
 * `--radius` is one value and everything rectangular is a multiple of it, so
 * most of the geometry follows along by itself. The exception is a corner drawn
 * *inside* another corner: the library's ladder is linear, but the inset between
 * the two boxes is a spacing value, so the pair only comes out even when
 *
 *     inner = outer − border − inset
 *
 * The border belongs in that sum and is the term easiest to drop, because it is
 * drawn inside the box: a 1px frame eats a pixel of the same corner the padding
 * eats. It was missing from this table until the knob moved and the segmented
 * control's sum was redone by hand.
 *
 * Nothing enforces the equation at runtime, and no render test can see it
 * either, because the class names (`rounded-lg`, `rounded-md`) are the same
 * before and after a retune of the knob. This file is where the arithmetic is
 * written down, which is the one part of it a test can hold.
 *
 * Missing in the two directions is not the same error, which is why there are two
 * assertions rather than one:
 *
 * - **Deeper than `outer − border − inset` is not allowed at all.** It is a
 *   near-miss at being concentric, and a near-miss reads as "did not line up"
 *   where a clear difference reads as "deliberately inset". Carried far enough it
 *   stops being subtle: past half the inner box's own height CSS clamps the
 *   radius, and the row becomes a capsule.
 * - **Shallower is allowed, by one pixel.** Smaller only reads as a slightly
 *   tighter corner. The pixel is not taste — it is deliberately under the
 *   smallest step of the ladder (`xs`, a quarter of the knob, 1.5px here), so a
 *   gap wider than it means a step was passed over rather than that none fitted.
 *
 * Neither direction can make the two arcs cross: the inset alone guarantees the
 * inner arc is inside the outer one. So this is about the corner band staying
 * even, not about one corner biting into the other.
 *
 * Deliberately not derived from the components: the table states what each pair
 * is and the knob is read from the stylesheet, so a retune of `--radius` is
 * caught here. Which classes the components actually use is covered where it
 * belongs — beside them, by the render tests in `brand-views.test.tsx`,
 * `ContextMenu.test.tsx`, `file-views.test.tsx` and `preview-views.test.tsx`,
 * which pin the inset as well as the two corners. Re-check this table when a
 * pair's inset or inner corner changes.
 */

/** The ladder, as multiples of `--radius`. Mirrors `themes/shared/theme.css`. */
const STEPS = { xs: 0.25, sm: 0.5, md: 0.75, lg: 1, xl: 1.5, "2xl": 2, "3xl": 3, "4xl": 4 } as const;

/** `--spacing` is 0.25rem, so `p-1` is 4px. Inset classes are written in those units. */
const SPACING_PX = 4;

/** How far under `outer − border − inset` a pair may sit before it is a different shape. */
const UNDER_TOLERANCE_PX = 1;

function knobPx(): number {
	const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
	const found = /--radius:\s*([\d.]+)rem/.exec(css);
	if (!found) throw new Error("`--radius` is not a rem value in index.css — this table cannot be checked");
	return Number(found[1]) * 16;
}

type Pair = {
	/** Where the two corners meet, so a failure names something findable. */
	where: string;
	/** Ladder step of the outer box. */
	outer: keyof typeof STEPS;
	/** Padding between them, in `--spacing` units — `p-1.5` is 1.5. */
	inset: number;
	/** Frame on the outer box, in px. `border` is 1 and `border-0` is the default. */
	border?: number;
	/** Ladder step of the inner box, or a literal px value for a fitted corner. */
	inner: keyof typeof STEPS | { px: number };
};

/**
 * The panel pairs keep `inset = --radius`, which is what makes their band zero:
 * with a 3xl panel and a 2xl row, `outer − inset − inner = 3r − r − 2r`. Both
 * insets were 4px when the knob was 5px, and stepping them with it is the point
 * — an inset that stays put widens the band by exactly what the knob moved.
 */
const PAIRS: Pair[] = [
	{ where: "SegmentedControl shell ↔ option", outer: "lg", inset: 0.5, border: 1, inner: { px: 3 } },
	{ where: "context menu panel ↔ row", outer: "3xl", inset: 1.5, inner: "2xl" },
	{ where: "selection bar panel ↔ action", outer: "3xl", inset: 1.5, inner: "2xl" },
];

function innerPx(inner: Pair["inner"], radius: number): number {
	return typeof inner === "object" ? inner.px : STEPS[inner] * radius;
}

/** `[inner, room]` in px, so a failure can report the arithmetic it used. */
function measured(pair: Pair, radius: number): [number, number] {
	const room = STEPS[pair.outer] * radius - (pair.border ?? 0) - pair.inset * SPACING_PX;
	return [innerPx(pair.inner, radius), room];
}

describe("concentric corners", () => {
	it("never lets an inner corner sit deeper than outer-minus-inset", () => {
		const radius = knobPx();
		for (const pair of PAIRS) {
			const [inner, room] = measured(pair, radius);
			// The message is the two numbers, so a failure reads as an arithmetic
			// problem rather than as a broken class name.
			expect(inner, `${pair.where}: inner ${inner}px against ${room}px of room`).toBeLessThanOrEqual(room);
		}
	});

	it("never lets an inner corner drift further than the smallest step", () => {
		const radius = knobPx();
		for (const pair of PAIRS) {
			const [inner, room] = measured(pair, radius);
			expect(
				room - inner,
				`${pair.where}: inner ${inner}px leaves ${room - inner}px of the corner band unused`,
			).toBeLessThanOrEqual(UNDER_TOLERANCE_PX);
		}
	});

	it("keeps the tolerance under the smallest step it is standing in for", () => {
		// If one pixel ever grew past `xs`, the second assertion would start
		// permitting a gap that a real ladder step could have filled, and the
		// failure message would no longer mean what it says.
		expect(UNDER_TOLERANCE_PX).toBeLessThan(STEPS.xs * knobPx());
	});

	it("reads the knob it is checking", () => {
		// A guard on the guard: if the stylesheet moves or stops stating `--radius`
		// in rem, the tests above would be checking arithmetic against a throw
		// rather than against the value the app actually uses.
		expect(knobPx()).toBeGreaterThan(0);
	});
});

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
 *     inner = outer − inset
 *
 * Nothing enforces that at runtime, and no render test can see it either, because
 * the class names (`rounded-lg`, `rounded-md`) are the same before and after a
 * retune of the knob. This file is where the arithmetic is written down, which is
 * the one part of it a test can hold.
 *
 * Missing in the two directions is not the same error, which is why there are two
 * assertions rather than one:
 *
 * - **Deeper than `outer − inset` is not allowed at all.** It is a near-miss at
 *   being concentric, and a near-miss reads as "did not line up" where a clear
 *   difference reads as "deliberately inset". Carried far enough it stops being
 *   subtle: past half the inner box's own height CSS clamps the radius, and the
 *   row becomes a capsule.
 * - **Shallower is allowed, up to a point.** That is the conventional direction —
 *   the row reads as its own shape, inset — and the library's own menu row sits
 *   1px under its own panel, so 1px is an observed convention rather than a
 *   number invented here. Past that it is not "slightly squarer", it is a
 *   different shape, and whoever writes it should say so in a comment.
 *
 * Neither direction can make the two arcs cross: the inset alone guarantees the
 * inner arc is inside the outer one. So this is about the corner band staying
 * even, not about one corner biting into the other.
 *
 * Deliberately not derived from the components: the table states what each pair
 * is and the knob is read from the stylesheet, so a retune of `--radius` is
 * caught here. Which classes the components actually use is covered where it
 * belongs — beside them, by the render tests in `brand-views.test.tsx`,
 * `ContextMenu.test.tsx` and `file-views.test.tsx`. Re-check this table when a
 * pair's inset or inner corner changes.
 */

/** The ladder, as multiples of `--radius`. Mirrors `themes/shared/theme.css`. */
const STEPS = { xs: 0.25, sm: 0.5, md: 0.75, lg: 1, xl: 1.5, "2xl": 2, "3xl": 3, "4xl": 4 } as const;

/** `--spacing` is 0.25rem, so `p-1` is 4px. Inset classes are written in those units. */
const SPACING_PX = 4;

/** How far under `outer − inset` a pair may sit before it is a different shape. */
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
	/** Padding between them, in `--spacing` units — `p-0.5` is 0.5. */
	inset: number;
	/** Ladder step of the inner box, or a literal px value for a fitted corner. */
	inner: keyof typeof STEPS | { px: number };
};

const PAIRS: Pair[] = [
	{ where: "SegmentedControl shell ↔ option", outer: "lg", inset: 0.5, inner: { px: 3 } },
	{ where: "context menu panel ↔ row", outer: "3xl", inset: 1, inner: "2xl" },
	{ where: "selection bar panel ↔ action", outer: "3xl", inset: 1, inner: "2xl" },
];

function innerPx(inner: Pair["inner"], radius: number): number {
	return typeof inner === "object" ? inner.px : STEPS[inner] * radius;
}

/** `[inner, room]` in px, so a failure can report the arithmetic it used. */
function measured(pair: Pair, radius: number): [number, number] {
	return [innerPx(pair.inner, radius), STEPS[pair.outer] * radius - pair.inset * SPACING_PX];
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

	it("never lets an inner corner drift further than the convention allows", () => {
		const radius = knobPx();
		for (const pair of PAIRS) {
			const [inner, room] = measured(pair, radius);
			expect(
				room - inner,
				`${pair.where}: inner ${inner}px leaves ${room - inner}px of the corner band unused`,
			).toBeLessThanOrEqual(UNDER_TOLERANCE_PX);
		}
	});

	it("reads the knob it is checking", () => {
		// A guard on the guard: if the stylesheet moves or stops stating `--radius`
		// in rem, the tests above would be checking arithmetic against a throw
		// rather than against the value the app actually uses.
		expect(knobPx()).toBeGreaterThan(0);
	});
});

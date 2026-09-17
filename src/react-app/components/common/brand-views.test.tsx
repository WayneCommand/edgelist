import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LogoMark } from "./LogoMark";
import { SegmentedControl } from "./SegmentedControl";

/**
 * Render smoke tests for the two shared pieces UI-10 extracted.
 *
 * Both are presentational, so there is nothing to exercise — what is worth
 * pinning is the reasoning that made them worth extracting: the segmented
 * control's geometry and its selected tone, and the mark's single radius rule.
 */
describe("SegmentedControl", () => {
	const options = [
		{ value: "list", label: "List" },
		{ value: "grid", label: "Grid" },
	] as const;

	function render(value: string) {
		return renderToStaticMarkup(
			<SegmentedControl ariaLabel="View mode" value={value} options={options} onChange={() => {}} />,
		);
	}

	it("names the group and offers every option", () => {
		const html = render("list");
		expect(html).toContain('role="group"');
		expect(html).toContain('aria-label="View mode"');
		expect(html).toContain("List");
		expect(html).toContain("Grid");
	});

	it("reports the chosen option as pressed", () => {
		// `aria-pressed` on a button in a group rather than a tablist: the three
		// callers are filters and view modes, not tabs, and the semantics were the
		// same in all three copies before the extraction.
		const html = render("grid");
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
		expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
	});

	it("keeps the concentric geometry all three copies had agreed on", () => {
		// The shell rounds at `--radius-lg` (5px) and insets by `p-0.5` (2px), so
		// the inner corner has 3px to live in and takes it as an arbitrary value:
		// the ladder's `rounded-md` is 3.75px, which spills 0.75px past the inner
		// arc. Only the pair is asserted here — the numbers are in the component's
		// header, next to the classes they describe, because a render test can see
		// class names but not what they resolve to.
		const html = render("list");
		expect(html).toContain("rounded-lg");
		// `\b` rather than a bare substring: the shell also carries `gap-0.5`, which
		// contains `p-0.5`, so the old assertion here passed without the inset
		// being there at all.
		expect(html).toMatch(/\bp-0\.5\b/);
		expect(html).toContain("rounded-[3px]");
		expect(html).not.toContain("rounded-md");
	});

	it("marks the chosen option with the token the library provides for it", () => {
		// All three copies used `text-accent` on `bg-accent-soft`; the library ships
		// `--accent-soft-foreground` for exactly that pairing, and it is what the
		// nav already used. This is the drift the extraction was meant to end.
		const html = render("list");
		expect(html).toContain("bg-accent-soft text-accent-soft-foreground");
		expect(html).not.toContain("bg-accent-soft text-accent ");
	});

	it("does not change the label weight with the selection", () => {
		// A semibold label would widen the button by a pixel or two, so the row
		// would twitch every time it was used.
		expect(render("list")).not.toContain("font-semibold");
	});
});

describe("LogoMark", () => {
	it("draws the initial as decoration, since the wordmark is always beside it", () => {
		const html = renderToStaticMarkup(<LogoMark />);
		expect(html).toContain("E");
		expect(html).toContain('aria-hidden="true"');
	});

	it("uses one radius rule at both sizes", () => {
		// A quarter of the tile, as a percentage: one value that stays right at
		// every size, instead of two pixel values kept in step by hand — which is
		// how the header and the sign-in page drifted apart.
		expect(renderToStaticMarkup(<LogoMark />)).toContain("rounded-[25%]");
		expect(renderToStaticMarkup(<LogoMark size="lg" />)).toContain("rounded-[25%]");
	});

	it("scales the tile and the letter together", () => {
		const small = renderToStaticMarkup(<LogoMark />);
		const large = renderToStaticMarkup(<LogoMark size="lg" />);
		expect(small).toContain("size-9");
		expect(large).toContain("size-14");
		expect(small).not.toBe(large);
	});
});

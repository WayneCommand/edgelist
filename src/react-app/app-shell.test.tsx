import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Shell } from "./App";
import { ROUTES } from "./routes";

/**
 * The app shell, pinned where it has actually broken before.
 *
 * There is no browser here, so this cannot answer the question the step was
 * really about — *are all four destinations reachable at 390px*. It does not
 * pretend to. What a static render can see is the class that made the answer no:
 * the navigation carried `hidden sm:flex`, which is `display: none` and out of
 * the accessibility tree for the whole phone range, and nothing else led to the
 * other three destinations. That is a property of the markup, and it is the part
 * worth a regression test.
 *
 * The other three assertions are about the shell holding one recipe instead of
 * two: the navigation has to *be* the shared segmented control, its geometry has
 * to survive the size tier, and the reading order has to stay brand →
 * navigation → controls → content when the bar folds to two rows on a phone.
 */
function render(pathname: string) {
	return renderToStaticMarkup(
		<MemoryRouter initialEntries={[pathname]}>
			<Shell />
		</MemoryRouter>,
	);
}

/** The `<nav>` opening tag, so an assertion can be about the element itself. */
function navTag(html: string) {
	const found = /<nav[^>]*>/.exec(html);
	if (!found) throw new Error("the shell has no <nav> — the navigation is missing entirely");
	return found[0];
}

/** Everything *inside* `<nav>`, so a sibling cannot satisfy the assertion. */
function navContent(html: string) {
	const start = html.indexOf("<nav");
	const end = html.indexOf("</nav>");
	if (start < 0 || end < 0) throw new Error("the shell has no <nav> — the navigation is missing entirely");
	return html.slice(html.indexOf(">", start) + 1, end);
}

describe("app shell", () => {
	it("renders every destination with no breakpoint attached", () => {
		const html = render(ROUTES.files());
		// `&` is escaped in static markup; the four labels are all present.
		for (const label of ["Files", "Storages", "Metadata", "Backup &amp; restore"]) {
			expect(html, `${label} is not reachable from the shell`).toContain(label);
		}
		const nav = navTag(html);
		expect(nav).not.toMatch(/\bhidden\b/);
		// `order-last` is how the second row happens on a phone without moving the
		// element in the DOM, which the reading-order test below depends on.
		expect(nav).toContain("order-last");
		expect(nav).toContain("overflow-x-auto");
	});

	it("navigates with the shared segmented control rather than a second recipe", () => {
		const html = render(ROUTES.storages);
		const nav = navContent(html);
		expect(nav).toContain('role="group"');
		// The `md` option box, which exists only inside the segmented control: if
		// the navigation went back to hand-written buttons, this disappears.
		expect(nav).toContain("h-7");
		// The old per-destination buttons were `text-sm`; the `md` option is
		// `text-[13px]`. `rounded-lg` is *not* a tell either way — the segmented
		// control's shell has always used it.
		expect(nav).not.toContain("text-sm");
		// One option is pressed — `storages` — and the other three are not.
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
		expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
	});

	it("keeps the reading order when the bar folds to two rows", () => {
		// Below `sm` the visual order is brand + controls, then the navigation.
		// The tab order is the DOM order at both widths, so it has to be brand →
		// navigation → controls; `order-last` is what lets both be true.
		const html = render(ROUTES.files());
		const brand = html.indexOf("EdgeList");
		const nav = html.indexOf("<nav");
		const controls = html.indexOf("Sign out");
		expect(brand).toBeGreaterThanOrEqual(0);
		expect(nav).toBeGreaterThan(brand);
		expect(controls).toBeGreaterThan(nav);
	});

	it("separates the toolbar from the content with material, not a rule", () => {
		const header = /<header[^>]*>/.exec(render(ROUTES.files()))?.[0] ?? "";
		expect(header).toContain("material-bar");
		expect(header).toContain("bg-background/80");
		expect(header).toContain("sm:h-13");
		// The 1px rule that used to do this job a second time.
		expect(header).not.toContain("border-b");
		expect(header).not.toContain("border-separator");
	});

	it("brings the content in with the page transition, not the message one", () => {
		const html = render(ROUTES.files());
		// `arrive` carries its own `prefers-reduced-motion` fallback, which is why
		// this is the animation to reuse rather than a new one.
		expect(html).toContain("arrive");
		// 2px rather than the 6px default: a whole plane moving 6px reads as the
		// window sliding sideways.
		expect(html).toContain("[--arrive-from:2px]");
	});
});

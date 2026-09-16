import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../lib/locale";
import { EmptyState } from "./EmptyState";
import { ThemeSelect } from "./ThemeSelect";

/**
 * Render smoke tests. Both components go through `react-dom/server`, so the
 * wording they render is English: `ThemeSelect` reads the language through the
 * hook, which gets `DEFAULT_LOCALE` from the server snapshot.
 */
describe("EmptyState", () => {
	it("draws the message and a decorative icon", () => {
		const html = renderToStaticMarkup(<EmptyState message="No files found" />);
		expect(html).toContain("No files found");
		expect(html).toContain('data-icon="inbox"');
		// The message carries the meaning; the tray is decoration.
		expect(html).toContain('aria-hidden="true"');
	});

	it("puts the message in a paragraph", () => {
		const html = renderToStaticMarkup(<EmptyState message="No storage configured." />);
		expect(html).toContain("<p");
		expect(html).toContain("No storage configured.");
	});

	it("arrives in two beats, disc first", () => {
		const html = renderToStaticMarkup(<EmptyState message="No files found" />);
		// Both blocks animate, and only the second waits — which is what makes it
		// a sequence. The delay is a variable so the two share one keyframe and
		// the second one holds its invisible start state until its turn.
		expect(html.match(/class="arrive/g)).toHaveLength(2);
		expect(html).toContain("[--arrive-delay:100ms]");
	});
});

describe("ThemeSelect", () => {
	beforeEach(() => {
		setLocale("en");
	});

	it("offers the system alongside the two explicit themes", () => {
		// A two-way switch cannot express "follow the system", and guessing on the
		// user's behalf would stop following it the moment the OS changed.
		const html = renderToStaticMarkup(<ThemeSelect />);
		expect(html).toContain("<select");
		for (const value of ["system", "light", "dark"]) expect(html).toContain(`value="${value}"`);
		expect(html).toContain("System");
		expect(html).toContain("Light");
		expect(html).toContain("Dark");
	});

	it("starts on the system preference when nothing has been chosen", () => {
		// Server rendering has no stored value, which is the same state as a first
		// visit: "not chosen" and "chosen as system" are one preference.
		expect(renderToStaticMarkup(<ThemeSelect />)).toContain('value="system" selected');
	});

	it("names itself for a screen reader", () => {
		expect(renderToStaticMarkup(<ThemeSelect />)).toContain('aria-label="Theme"');
	});
});

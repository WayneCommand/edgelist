import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

/**
 * A render smoke test for the shared empty state. It is presentational, so
 * there is no behaviour to pin — what is worth pinning is that the icon stays
 * decorative, since three pages now depend on this one copy of it.
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
});

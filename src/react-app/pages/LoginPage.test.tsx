import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LoginPage } from "./LoginPage";

/**
 * The sign-in page, pinned where a rewrite actually breaks things.
 *
 * Three of these are about the *card*, because the card is the one thing this
 * design does that the rest of the app does not, and the temptation to "tidy"
 * it away is real — UI-19 removed a card from this exact page and argued for
 * it convincingly. The assertion that matters is not "there is a card" but
 * "the card is lifted": a surface with no shadow on a page that is a different
 * surface is the failure mode that removal produced and this rewrite has to
 * not reproduce. So the shadow is what is pinned, not the class name.
 *
 * The rest are the page's obligations that are easy to lose in a layout pass
 * and impossible to see in a static render of the markup alone:
 *
 * - both credentials are still there, and they are still two fields;
 * - the passkey button is enabled and tells the truth when pressed, rather
 *   than being a disabled control or a second submit;
 * - every visible string comes from the catalogue (the parity test in
 *   `lib/i18n.test.ts` catches a missing key, but not a hardcoded literal);
 * - the footer's three links go somewhere, and off-site links are not silently
 *   opened in this tab.
 */

function render() {
	return renderToStaticMarkup(
		<MemoryRouter initialEntries={["/@login"]}>
			<LoginPage onSignedIn={() => {}} />
		</MemoryRouter>,
	);
}

/** The card's own opening tag — the element the three surface assertions are about. */
function cardTag(html: string) {
	const found = /<div class="signin-card[^"]*"/.exec(html);
	if (!found) throw new Error("the sign-in page has no card — `signin-card` is not on any element");
	return found[0];
}

describe("sign-in page", () => {
	it("takes both credentials, since the credential is a key pair", () => {
		const html = render();
		// Two fields, one password. The design sheet has a single field because
		// it is a page for one Apple ID; this app's credential is a pair, so the
		// sheet's field would have to be split back into two anyway.
		expect(html.match(/<input/g)).toHaveLength(2);
		expect(html.match(/type="password"/g)).toHaveLength(1);
		// The autocomplete hints are what let a password manager fill both.
		// Matched case-insensitively on purpose: `autoComplete` is the DOM name
		// React writes through and a hand-written `<input>` would spell it
		// lowercase, and the assertion is about the attribute being there,
		// not about which of the two spellings produced it.
		expect(html).toMatch(/autocomplete="username"/i);
		expect(html).toMatch(/autocomplete="current-password"/i);
		// Both are required, so the browser refuses an empty submit before the
		// Worker has to.
		expect(html.match(/\brequired\b/g)).toHaveLength(2);
	});

	it("names each field, rather than relying on the placeholder", () => {
		// The sheet's field carries no label. A placeholder is not a label: it
		// vanishes the moment there is something to read, and it is not announced
		// as one. Both fields therefore keep a `<label>`.
		const html = render();
		expect(html.match(/<label/g)).toHaveLength(2);
		expect(html).toContain("Access Key");
		expect(html).toContain("Secret Key");
	});

	it("lifts the card, instead of painting a rectangle on the page", () => {
		// The failure UI-19 was reacting to was a card that did nothing: 3.6
		// points of surface difference, no border and no visible shadow. A card
		// is justified by being lifted, so that is the property pinned here.
		const tag = cardTag(render());
		expect(tag).toContain("signin-card");
		// The width is its own token, not a `max-w-*` step: 30rem is the
		// sheet's own 480px, and the point of the token is that the value can
		// be *reasoned* about rather than inferred from a class name. See
		// `--container-signin`.
		expect(tag).toContain("max-w-signin");
		// The radius is the card's own token, not a ladder step: the sheet names
		// 18–24px for this card, and a ladder step would walk out of that range
		// the next time `--radius` is retuned.
		expect(tag).not.toContain("rounded-3xl");
	});

	it("states the card's surface and shadow as tokens with both themes", () => {
		// A render test cannot see a custom property's value, so it reads the
		// stylesheet. What it checks is the thing that would be a silent bug: a
		// shadow defined for one theme only, which is invisible until someone
		// loads the dark theme — and then reads as a missing shadow rather than
		// as a missing *declaration*.
		const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
		// The light declaration has to come *before* the dark one: the two are
		// in equal-specificity blocks, so the later one wins for anything that
		// is under `[data-theme="dark"]` — which is the point of the order, and
		// is worth pinning rather than assuming. Counting the declarations
		// alone would pass on a stylesheet with them the other way round.
		const [lightShadow, darkShadow] = [...css.matchAll(/--signin-card-shadow:\s*([^;]+);/g)].map((match) =>
			match[1].trim(),
		);
		expect(css.indexOf("--signin-card-shadow:")).toBeLessThan(css.lastIndexOf("--signin-card-shadow:"));
		expect(lightShadow).toBeTruthy();
		expect(darkShadow).toBeTruthy();
		// Two declarations: the light `:root` group and the dark override.
		expect(css.match(/--signin-card-shadow:/g)).toHaveLength(2);
		// The dark value is not the light one: black at 5% under a `oklch(21%)`
		// card is invisible, so a copy-paste of the light pair is the bug.
		expect(lightShadow).not.toBe(darkShadow);
		expect(css).toContain("@utility signin-card");
	});

	it("keeps the passkey button pressable and honest", () => {
		const html = render();
		// Not disabled: a greyed-out call to action on a sign-in page reads as
		// "your account is broken", and the button's *claim* is not false — this
		// deployment simply has no passkey endpoint.
		// Found from the label *forwards*, through the icon's markup to the
		// button's own opening tag. Backwards is the tempting direction and it
		// is the wrong one now that the two buttons share a row: a slice wide
		// enough to clear the icon reaches back into the previous button, and
		// the regex then describes the submit button instead of this one.
		const button = /<button[^>]*>[\s\S]*?Use a passkey/.exec(html)?.[0].replace(/[\s\S]*<button/, "<button") ?? "";
		expect(button).toContain('type="button"');
		expect(button).not.toContain("disabled");
		// And it is not a second submit: pressing it must not post the form with
		// an empty key pair.
		expect(html.match(/type="submit"/g)).toHaveLength(1);
		// The sheet's own hint line is kept, because it is the honest reason the
		// feature needs a recent device.
		expect(html).toContain("Requires a device running iOS 17 or later.");
	});

	it("puts the two buttons in one row, and lets the row decide their width", () => {
		// Both buttons are still there — the layout changed, the pair did not.
		// The row is what makes them a pair: a submit button with a secondary
		// action stacked under it reads as one action and an aside, which is a
		// different offer from two ways in.
		const html = render();
		const row = /<div class="mt-6 flex items-stretch gap-3">[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
		expect(row, "the two buttons are not in one row").not.toBe("");
		expect(row.match(/<button/g)).toHaveLength(2);
		// Both take an equal share of the row (`flex-1 basis-0`), rather than a
		// fixed half each: with `basis-0` the split is the row's width split in
		// two, so the longer passkey label cannot take the wider half and turn
		// the pair into a pair of unequal buttons.
		expect(row.match(/\bflex-1\b/g)).toHaveLength(2);
		expect(row.match(/\bbasis-0\b/g)).toHaveLength(2);
		// `items-stretch` is what keeps the two the same height — one carries a
		// 20px icon and the other only text, so without it the row's halves
		// differ by a couple of pixels and stop reading as one shape.
		expect(row).toContain("items-stretch");
		// The passkey label is the longest string in the row, and it is also
		// the one a narrow card would wrap first. `whitespace-nowrap` is the
		// honest way to keep it on one line: if the row ever gets too narrow,
		// it overflows visibly instead of quietly turning one call to action
		// into a three-line button.
		expect(row).toContain("whitespace-nowrap");
		// The row sits at the end of the form, and both buttons are inside it.
		const form = /<form[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
		expect(form).toContain(row);
	});

	it("draws the halo as decoration", () => {
		// Ten dots on one element, spinning. It is not a control and not an
		// image, so it must be out of the accessibility tree — otherwise the
		// page's first heading is preceded by an unlabelled graphic.
		const html = render();
		expect(html).toContain("signin-halo");
		expect(html).toContain("signin-halo-bloom");
		expect(html.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
	});

	it("renders every string from the catalogue", () => {
		// The parity test in `lib/i18n.test.ts` fails on a key that has no
		// translation; this fails on a string that never became a key. The
		// rewrite adds eight of them, which is where a literal is most likely to
		// slip in.
		const html = render();
		for (const literal of [
			"Sign in to EdgeList",
			"Access Key",
			"Secret Key",
			"Sign in",
			"Use a passkey",
			"Learn how your data is managed",
			"System status",
			"Privacy policy",
			"Terms &amp; conditions",
			"All rights reserved",
		]) {
			expect(html, `"${literal}" is not on the page`).toContain(literal);
		}
	});

	it("puts the footer's links somewhere and keeps them out of this tab", () => {
		const html = render();
		const links = [...html.matchAll(/<a href="([^"]+)"([^>]*)>/g)];
		expect(links).toHaveLength(4);
		for (const [, href, rest] of links) {
			expect(href).toMatch(/^https:\/\//);
			// An off-site link that replaces the sign-in page loses the page the
			// user was on, and this one is reached before any session exists.
			expect(rest, `${href} opens in this tab`).toContain('rel="noreferrer"');
			expect(rest, `${href} opens in this tab`).toContain('target="_blank"');
		}
	});
});

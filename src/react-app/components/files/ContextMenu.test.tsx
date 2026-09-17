import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { fileActions } from "../../lib/fileActions";
import { setLocale } from "../../lib/locale";
import { ObjMask, permissionsFor } from "../../lib/mask";
import type { FileItem } from "../../lib/types";
import { menuPosition } from "../../lib/menu";
import { ContextMenu } from "./ContextMenu";

/** The menu is built through the ambient translator, so the wording is pinned. */
beforeEach(() => {
	setLocale("en");
});

const noop = () => {};
const handlers = { open: noop, rename: noop, copy: noop, move: noop, remove: noop, download: noop, link: noop };

const file: FileItem = { name: "a.txt", size: 1, is_dir: false, modified: "", path: "/a.txt" };

describe("menuPosition", () => {
	const viewport = { width: 1000, height: 800 };

	it("opens where the pointer is", () => {
		expect(menuPosition({ x: 100, y: 200 }, viewport)).toEqual({ left: 100, top: 200 });
	});

	it("pulls back inside the right and bottom edges", () => {
		const { left, top } = menuPosition({ x: 990, y: 795 }, viewport);
		expect(left).toBeLessThan(viewport.width);
		expect(top).toBeLessThan(viewport.height);
	});

	it("never leaves the top-left corner", () => {
		expect(menuPosition({ x: -50, y: -50 }, viewport)).toEqual({ left: 8, top: 8 });
	});

	it("passes the point through when there is no viewport to clamp against", () => {
		// Server rendering and tests have no window.
		expect(menuPosition({ x: 12, y: 34 })).toEqual({ left: 12, top: 34 });
	});
});

describe("fileActions", () => {
	it("mirrors the permissions it is given", () => {
		const actions = fileActions(permissionsFor([file]), handlers);
		expect(actions.map((action) => action.label)).toEqual([
			"Open",
			"Rename",
			"Copy",
			"Move",
			"Download",
			"Copy link",
			"Delete",
		]);
		expect(actions.every((action) => !action.disabled)).toBe(true);
		expect(actions[actions.length - 1]?.danger).toBe(true);
	});

	it("carries the reason a locked entry is unavailable", () => {
		const locked = fileActions(permissionsFor([{ ...file, mask: ObjMask.NoRename }]), handlers);
		const rename = locked.find((action) => action.label === "Rename");
		expect(rename?.disabled).toBe(true);
		expect(rename?.title).toBe("This item cannot be renamed");
	});
});

describe("context menu", () => {
	it("renders a disabled entry with its reason", () => {
		const html = renderToStaticMarkup(
			<ContextMenu position={{ x: 10, y: 10 }} items={fileActions(permissionsFor([]), handlers)} onClose={noop} />,
		);
		expect(html).toContain('role="menu"');
		expect(html).toContain('disabled=""');
		expect(html).toContain('title="Nothing is selected"');
	});

	it("separates the destructive entry", () => {
		const html = renderToStaticMarkup(
			<ContextMenu position={{ x: 10, y: 10 }} items={fileActions(permissionsFor([file]), handlers)} onClose={noop} />,
		);
		expect(html).toContain("<hr");
		expect(html).not.toContain('disabled=""');
	});

	it("insets its rows so a highlight stays inside the rounded corner", () => {
		const html = renderToStaticMarkup(
			<ContextMenu position={{ x: 10, y: 10 }} items={fileActions(permissionsFor([file]), handlers)} onClose={noop} />,
		);
		// HeroUI's own menu geometry: an 18px panel, a 6px inset, 12px rows.
		// Without the inset a full-width highlight is a square band that cuts into
		// the corner, and `overflow-auto` then lets it spill past the radius.
		// The inset is pinned alongside the corners because the guard in
		// geometry.test.ts reads it from a table rather than from the component —
		// an inset that drifted here would leave it measuring a shape nobody
		// renders. `\b` rather than a bare substring, since the rows carry `py-1.5`
		// and the panel carries `gap-1`.
		expect(html).toContain("rounded-3xl");
		expect(html).toContain("rounded-2xl");
		expect(html).toMatch(/\bp-1\.5\b/);
		expect(html).toContain("min-h-9");
		// The edge is a shadow, not a fixed border colour, so it adapts to whatever
		// the menu is drawn over.
		expect(html).toContain("shadow-overlay");
		expect(html).not.toContain("border-border");
	});

	it("arrives with HeroUI's own overlay motion", () => {
		const html = renderToStaticMarkup(
			<ContextMenu position={{ x: 10, y: 10 }} items={fileActions(permissionsFor([file]), handlers)} onClose={noop} />,
		);
		// The library's popover recipe: 150ms in, 100ms out, and the zoom is
		// anchored at the corner the menu opened from rather than at its centre.
		expect(html).toContain("animate-in");
		expect(html).toContain("duration-150");
		expect(html).toContain("zoom-in-90");
		expect(html).toContain("fade-in-0");
		expect(html).toContain("origin-top-left");
		// The exit is swapped in over the enter, never alongside it, and it holds
		// its last frame until the timeout removes the menu.
		expect(html).not.toContain("animate-out");
		expect(html).not.toContain("animate-in fill-mode-forwards");
		// Motion is never the only feedback channel, and never forced.
		expect(html).toContain("motion-reduce:animate-none");
	});
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fileActions } from "../../lib/fileActions";
import { ObjMask, permissionsFor } from "../../lib/mask";
import type { FileItem } from "../../lib/types";
import { menuPosition } from "../../lib/menu";
import { ContextMenu } from "./ContextMenu";

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
});

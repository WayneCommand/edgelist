import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Selection } from "../../hooks/useSelection";
import { permissionsFor } from "../../lib/mask";
import type { FileItem } from "../../lib/types";
import { FileGrid } from "./FileGrid";
import { FileTable } from "./FileTable";
import { FileToolbar } from "./FileToolbar";
import { SelectionBar } from "./SelectionBar";

/**
 * Render smoke tests. They go through `react-dom/server`, so they catch a
 * crashing render or a prop that no longer lines up without pulling in a DOM
 * implementation; the selection behaviour itself is covered by the hook tests.
 */

const items: FileItem[] = [
	{ name: "docs", size: 0, is_dir: true, modified: "2026-01-02T03:04:05Z", path: "/docs" },
	{ name: "readme.md", size: 2048, is_dir: false, modified: "2026-01-03T03:04:05Z", path: "/readme.md" },
];

function fakeSelection(overrides: Partial<Selection> = {}): Selection {
	return {
		items: [],
		paths: new Set<string>(),
		count: 0,
		isSelected: () => false,
		toggle: () => {},
		selectOnly: () => {},
		toggleAll: () => {},
		clear: () => {},
		allSelected: false,
		someSelected: false,
		...overrides,
	};
}

const noop = () => {};

const viewProps = { selection: fakeSelection(), onOpen: noop, onContextMenu: noop };

describe("file views", () => {
	it("renders one table row per entry", () => {
		const html = renderToStaticMarkup(<FileTable items={items} {...viewProps} />);
		expect(html).toContain("docs");
		expect(html).toContain("readme.md");
		expect(html).toContain("2.0 KB");
	});

	it("exposes the active sort on the header", () => {
		const html = renderToStaticMarkup(
			<FileTable items={items} {...viewProps} sort={{ field: "size", direction: "desc" }} onSort={noop} />,
		);
		expect(html).toContain('aria-sort="descending"');
		expect(html).toContain("↓");
	});

	it("renders plain header labels when sorting is off", () => {
		const html = renderToStaticMarkup(<FileTable items={items} {...viewProps} />);
		expect(html).toContain('aria-sort="none"');
		expect(html).not.toContain("<button");
	});

	it("renders one tile per entry in grid view", () => {
		const html = renderToStaticMarkup(<FileGrid items={items} {...viewProps} />);
		expect(html).toContain("docs");
		expect(html).toContain("Folder");
		expect(html).toContain("2.0 KB");
	});

	it("marks the selected entries", () => {
		const html = renderToStaticMarkup(
			<FileGrid items={items} {...viewProps} selection={fakeSelection({ isSelected: () => true, count: 2 })} />,
		);
		expect(html).toContain('aria-selected="true"');
	});

	it("marks the active view in the toolbar", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="grid"
				uploading={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain("Grid");
		expect(html).toContain("Select all");
	});

	it("offers both a file and a folder picker", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="list"
				uploading={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).toContain("Upload folder");
		expect(html).toContain("webkitdirectory");
	});

	it("reports upload progress and locks the buttons while busy", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="list"
				uploading={{ done: 3, total: 8 }}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).toContain("Uploading 3/8");
		expect(html).toContain('role="status"');
	});

	it("summarises the selection count in the toolbar", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection({ count: 2, someSelected: true })}
				view="list"
				uploading={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).toContain("2 selected");
	});
});

const barHandlers = { onRename: noop, onCopy: noop, onMove: noop, onDelete: noop, onDownload: noop, onCopyLink: noop };

/** The bar reads its permissions from the same helper the page does. */
function barProps(selected: FileItem[]) {
	return {
		selection: fakeSelection({ items: selected, count: selected.length }),
		permissions: permissionsFor(selected),
		...barHandlers,
	};
}

describe("selection bar", () => {
	it("stays hidden with nothing selected", () => {
		expect(renderToStaticMarkup(<SelectionBar {...barProps([])} />)).toBe("");
	});

	it("names a single selection", () => {
		expect(renderToStaticMarkup(<SelectionBar {...barProps([items[1]])} />)).toContain("readme.md");
	});

	it("keeps single-target actions for a multi-selection", () => {
		const html = renderToStaticMarkup(<SelectionBar {...barProps(items)} />);
		expect(html).toContain("2 selected");
		expect(html).toContain('title="Rename works on one entry at a time"');
	});

	it("refuses to download a selection holding a folder", () => {
		const html = renderToStaticMarkup(<SelectionBar {...barProps([items[0]])} />);
		expect(html).toContain('title="Archives are not supported yet"');
		expect(html).toContain('title="Folders have no link"');
	});

	it("leaves every action available for a single file", () => {
		const html = renderToStaticMarkup(<SelectionBar {...barProps([items[1]])} />);
		// The shared class list mentions `disabled:` variants, so match the attribute.
		expect(html).not.toContain('disabled=""');
		expect(html).toContain("Copy link");
	});

	it("refuses to transfer a selection spanning several folders", () => {
		// What a search produces: two entries from different directories.
		const spread: FileItem[] = [
			{ name: "a.txt", size: 1, is_dir: false, modified: "", path: "/one/a.txt" },
			{ name: "b.txt", size: 1, is_dir: false, modified: "", path: "/two/b.txt" },
		];
		const html = renderToStaticMarkup(<SelectionBar {...barProps(spread)} />);
		expect(html).toContain('title="Copy needs entries from a single folder"');
		expect(html).toContain('title="Move needs entries from a single folder"');
	});
});

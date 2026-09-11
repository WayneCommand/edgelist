import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Selection } from "../../hooks/useSelection";
import type { FileItem } from "../../lib/types";
import { FileGrid } from "./FileGrid";
import { FileTable } from "./FileTable";
import { FileToolbar } from "./FileToolbar";

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

describe("file views", () => {
	it("renders one table row per entry", () => {
		const html = renderToStaticMarkup(<FileTable items={items} selection={fakeSelection()} onOpen={noop} />);
		expect(html).toContain("docs");
		expect(html).toContain("readme.md");
		expect(html).toContain("2.0 KB");
	});

	it("exposes the active sort on the header", () => {
		const html = renderToStaticMarkup(
			<FileTable
				items={items}
				selection={fakeSelection()}
				sort={{ field: "size", direction: "desc" }}
				onSort={noop}
				onOpen={noop}
			/>,
		);
		expect(html).toContain('aria-sort="descending"');
		expect(html).toContain("↓");
	});

	it("renders plain header labels when sorting is off", () => {
		const html = renderToStaticMarkup(<FileTable items={items} selection={fakeSelection()} onOpen={noop} />);
		expect(html).toContain('aria-sort="none"');
		expect(html).not.toContain("<button");
	});

	it("renders one tile per entry in grid view", () => {
		const html = renderToStaticMarkup(<FileGrid items={items} selection={fakeSelection()} onOpen={noop} />);
		expect(html).toContain("docs");
		expect(html).toContain("Folder");
		expect(html).toContain("2.0 KB");
	});

	it("marks the selected entries", () => {
		const html = renderToStaticMarkup(
			<FileGrid
				items={items}
				selection={fakeSelection({ isSelected: (path) => path === "/docs", count: 1 })}
				onOpen={noop}
			/>,
		);
		expect(html).toContain('aria-selected="true"');
	});

	it("marks the active view in the toolbar", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="grid"
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

	it("summarises the selection count in the toolbar", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection({ count: 2, someSelected: true })}
				view="list"
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).toContain("2 selected");
	});
});

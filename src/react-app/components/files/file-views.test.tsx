import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Selection } from "../../hooks/useSelection";
import { setLocale } from "../../lib/locale";
import { OBJ_LOCKED, OBJ_READ_ONLY, ObjMask, permissionsFor } from "../../lib/mask";
import type { FileItem } from "../../lib/types";
import { FileGrid } from "./FileGrid";
import { FileTable } from "./FileTable";
import { FileToolbar } from "./FileToolbar";
import { Pager } from "./Pager";
import { PathBar } from "./PathBar";
import { SelectionBar } from "./SelectionBar";

/**
 * Render smoke tests. They go through `react-dom/server`, so they catch a
 * crashing render or a prop that no longer lines up without pulling in a DOM
 * implementation; the selection behaviour itself is covered by the hook tests.
 *
 * Two things follow from rendering on the server. Every assertion here is about
 * the English wording: a component that reads the language through the hook gets
 * `DEFAULT_LOCALE` from `useSyncExternalStore`'s server snapshot, and the two
 * helpers that read it ambiently — `permissionsFor` and `fileActions` — are
 * pinned by the `beforeEach` below. The translations themselves are covered by
 * the catalogue's own tests; a browser is where the switch is exercised.
 */
beforeEach(() => {
	setLocale("en");
});

const items: FileItem[] = [
	{ name: "docs", size: 0, is_dir: true, modified: "2026-01-02T03:04:05Z", path: "/docs" },
	{ name: "readme.md", size: 2048, is_dir: false, modified: "2026-01-03T03:04:05Z", path: "/readme.md" },
];

/**
 * A mount point, the level that only exists to reach it, and an ordinary
 * folder. All three are directories; only the first is a storage you can write
 * through, so only the first must stop looking like a folder.
 */
const mountItems: FileItem[] = [
	{
		name: "drive",
		size: 0,
		is_dir: true,
		modified: "2026-01-02T03:04:05Z",
		path: "/drive",
		mask: OBJ_LOCKED | ObjMask.Virtual,
	},
	{
		name: "layer",
		size: 0,
		is_dir: true,
		modified: "2026-01-02T03:04:05Z",
		path: "/layer",
		mask: OBJ_READ_ONLY | ObjMask.Virtual,
	},
	{ name: "docs", size: 0, is_dir: true, modified: "2026-01-02T03:04:05Z", path: "/docs" },
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
		// The direction is an arrow glyph rather than a typed arrow, so it can
		// inherit the header's colour in every state.
		expect(html).toContain('data-icon="arrow-down"');
		expect(html).not.toContain('data-icon="arrow-up"');
	});

	it("points the sort arrow the other way when the order flips", () => {
		const html = renderToStaticMarkup(
			<FileTable items={items} {...viewProps} sort={{ field: "size", direction: "asc" }} onSort={noop} />,
		);
		expect(html).toContain('data-icon="arrow-up"');
		expect(html).not.toContain('data-icon="arrow-down"');
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

	it("draws a focus ring on a row and on a tile", () => {
		const table = renderToStaticMarkup(<FileTable items={items} {...viewProps} />);
		const grid = renderToStaticMarkup(<FileGrid items={items} {...viewProps} />);
		expect(table).toContain("focus-visible:ring-2");
		// The row is inset: the card around the list clips whatever a row tries
		// to paint outside its own box, so an offset ring would lose its edges.
		expect(table).toContain("focus-visible:ring-inset");
		expect(grid).toContain("focus-visible:ring-2");
	});

	it("reveals a tile's checkbox when the tile itself takes the tab", () => {
		const html = renderToStaticMarkup(<FileGrid items={items} {...viewProps} />);
		// The tile is the tab stop, so the reveal has to hang off the tile being
		// focused; a `focus:` on the checkbox only ever answered the mouse.
		expect(html).toContain("group-focus-within:opacity-100");
	});

	it("marks the active view in the toolbar", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="grid"
				uploading={null}
				writeHint={null}
				ceilingHint={null}
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
				writeHint={null}
				ceilingHint={null}
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
				writeHint={null}
				ceilingHint={null}
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
				writeHint={null}
				ceilingHint={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).toContain("2 selected");
	});

	it("locks the three create actions when the directory cannot take a write", () => {
		const hint = "No storage is mounted at /";
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="list"
				uploading={null}
				writeHint={hint}
				ceilingHint={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		// A disabled button cannot show a tooltip, so the reason is plain text.
		expect(html).toContain('data-testid="write-hint"');
		expect(html).toContain(hint);
		// New folder, Upload folder and Upload are the three that create entries.
		expect(html.match(/disabled=""/g)).toHaveLength(3);
		// Refresh stays available: reading a directory that cannot be written to
		// is still perfectly reasonable.
		expect(html).toContain("Refresh");
	});

	it("offers no write hint when a storage serves the directory", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="list"
				uploading={null}
				writeHint={null}
				ceilingHint={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).not.toContain('data-testid="write-hint"');
		expect(html).not.toContain('disabled=""');
	});

	it("reports how far through a split upload the current file is", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="list"
				uploading={{ done: 1, total: 3, bytes: { sent: 40, total: 160 } }}
				writeHint={null}
				ceilingHint={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		// Without this the counter sits at "1/3" for however long a large file
		// takes, which reads as a hang.
		expect(html).toContain("Uploading 1/3 · 25%");
	});

	it("says nothing about a file size in a directory whose storage can split uploads", () => {
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="list"
				uploading={null}
				writeHint={null}
				ceilingHint={null}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).not.toContain('data-testid="ceiling-hint"');
	});

	it("states the per-file ceiling where the storage cannot split an upload", () => {
		const hint = "This storage cannot accept a split upload — 100 MB per file";
		const html = renderToStaticMarkup(
			<FileToolbar
				selection={fakeSelection()}
				view="list"
				uploading={null}
				writeHint={null}
				ceilingHint={hint}
				onViewChange={noop}
				onRefresh={noop}
				onNewFolder={noop}
				onUpload={noop}
			/>,
		);
		expect(html).toContain('data-testid="ceiling-hint"');
		expect(html).toContain("100 MB per file");
		// It is a note about the storage, not a reason the buttons are unusable:
		// a small file still goes up perfectly well.
		expect(html).not.toContain('disabled=""');
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

	it("wears the same surface as the context menu", () => {
		const html = renderToStaticMarkup(<SelectionBar {...barProps([items[1]])} />);
		// 24px panel, 4px inset, 16px rows — HeroUI's own menu geometry, so the
		// highlight of a pressed action ends inside the corner rather than slicing
		// through it. The edge is a shadow so it adapts to whatever it floats over,
		// which a fixed `border-border` does not.
		expect(html).toContain("rounded-3xl");
		expect(html).toContain("rounded-2xl");
		expect(html).toContain("shadow-overlay");
		expect(html).not.toContain("border-border");
	});
});

const pagerHandlers = { onPage: noop, onPageSize: noop, onMode: noop, onLoadMore: noop };

function pagerProps(overrides: Partial<Parameters<typeof Pager>[0]> = {}) {
	return {
		mode: "pagination" as const,
		page: 1,
		pageSize: 100,
		total: 342,
		loading: false,
		...pagerHandlers,
		...overrides,
	};
}

describe("pager", () => {
	it("renders nothing for an empty directory", () => {
		expect(renderToStaticMarkup(<Pager {...pagerProps({ total: 0 })} />)).toBe("");
	});

	it("reports the range the page shows", () => {
		expect(renderToStaticMarkup(<Pager {...pagerProps()} />)).toContain("1–100 of 342");
	});

	it("marks the current page", () => {
		const html = renderToStaticMarkup(<Pager {...pagerProps({ page: 2 })} />);
		expect(html).toContain('aria-current="page"');
		expect(html).toContain('aria-pressed="true"');
	});

	it("drops the page numbers when everything fits", () => {
		const html = renderToStaticMarkup(<Pager {...pagerProps({ total: 12 })} />);
		expect(html).toContain("12 items");
		expect(html).not.toContain('aria-label="Next page"');
	});

	it("counts a single entry in the singular", () => {
		expect(renderToStaticMarkup(<Pager {...pagerProps({ total: 1 })} />)).toContain("1 item");
	});

	it("offers load more instead of page numbers in the growing mode", () => {
		const html = renderToStaticMarkup(<Pager {...pagerProps({ mode: "load_more", page: 2 })} />);
		expect(html).toContain("Showing 200 of 342");
		expect(html).toContain("Show more");
		expect(html).not.toContain('aria-current="page"');
	});

	it("hides load more once everything has arrived", () => {
		const html = renderToStaticMarkup(<Pager {...pagerProps({ mode: "load_more", page: 4 })} />);
		expect(html).toContain("Showing 342 of 342");
		expect(html).not.toContain("Show more");
	});

	it("offers no paging at all when the page size is 'all'", () => {
		const html = renderToStaticMarkup(<Pager {...pagerProps({ pageSize: 0 })} />);
		expect(html).toContain("342 items");
		expect(html).not.toContain('aria-label="Next page"');
		expect(html).not.toContain("Show more");
	});

	it("shows the chosen page size in the selector", () => {
		expect(renderToStaticMarkup(<Pager {...pagerProps({ pageSize: 50 })} />)).toContain('<option value="50" selected');
	});
});

describe("path bar", () => {
	const crumbs = [
		{ name: "waynecos", path: "/waynecos" },
		{ name: "docs", path: "/waynecos/docs" },
	];

	it("lists the crumbs and a way back to the root", () => {
		const html = renderToStaticMarkup(<PathBar path="/waynecos/docs" crumbs={crumbs} onNavigate={noop} />);
		expect(html).toContain("Root");
		expect(html).toContain("waynecos");
		expect(html).toContain("docs");
	});

	it("starts as a breadcrumb, not an editor", () => {
		const html = renderToStaticMarkup(<PathBar path="/waynecos/docs" crumbs={crumbs} onNavigate={noop} />);
		expect(html).not.toContain('aria-label="Path"');
		expect(html).toContain('aria-label="Edit path"');
	});

	it("says where a search ran", () => {
		const html = renderToStaticMarkup(<PathBar path="/waynecos" crumbs={[crumbs[0]]} searching onNavigate={noop} />);
		expect(html).toContain("Search results in");
	});
});

// A mount point is a directory that refuses rename, move and remove, so leaving
// it with the folder glyph makes the list lie about what it will do. The
// intermediate level a nested mount needs is *not* a mount point — it has no
// storage of its own — and must keep looking like the folder it is.
describe("mount points in the listing", () => {
	it("gives a mount point a storage glyph and its own label in the table", () => {
		const html = renderToStaticMarkup(<FileTable items={mountItems} {...viewProps} />);
		expect(html).toContain('data-icon="database"');
		expect(html).toContain("Mount point");
		// `layer` and `docs` are folders, so exactly two keep the folder glyph.
		expect(html.match(/data-icon="folder"/g)).toHaveLength(2);
	});

	it("gives a mount point a storage glyph and its own label in the grid", () => {
		const html = renderToStaticMarkup(<FileGrid items={mountItems} {...viewProps} />);
		expect(html).toContain('data-icon="database"');
		expect(html).toContain("Mount point");
		expect(html.match(/data-icon="folder"/g)).toHaveLength(2);
	});

	it("keeps the plain listing free of the storage glyph", () => {
		const html = renderToStaticMarkup(<FileTable items={items} {...viewProps} />);
		expect(html).not.toContain('data-icon="database"');
		expect(html).not.toContain("Mount point");
		// The ordinary pair still gets its glyph: one folder, one file.
		expect(html).toContain('data-icon="folder"');
		expect(html).toContain('data-icon="file"');
	});
});

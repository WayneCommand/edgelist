import { describe, expect, it } from "vitest";
import {
	directoriesOf,
	directoriesToCreate,
	droppedTree,
	pickedFiles,
	pickedTree,
	readAllEntries,
	targetPath,
	traverseEntry,
} from "./dropUpload";

/** A directory entry whose reader hands back at most `batchSize` children per call. */
function fakeDirectory(name: string, children: FileSystemEntry[], batchSize = 100): FileSystemEntry {
	let read = 0;
	const reader = {
		readEntries: (success: (entries: FileSystemEntry[]) => void) => {
			const batch = children.slice(read, read + batchSize);
			read += batch.length;
			success(batch);
		},
	};
	return {
		isFile: false,
		isDirectory: true,
		name,
		createReader: () => reader,
	} as unknown as FileSystemEntry;
}

function fakeFile(name: string): FileSystemEntry {
	return {
		isFile: true,
		isDirectory: false,
		name,
		file: (success: (file: File) => void) => success(new File(["body"], name)),
	} as unknown as FileSystemEntry;
}

function fakeItem(entry: FileSystemEntry | null): DataTransferItem {
	return { kind: "file", webkitGetAsEntry: () => entry } as unknown as DataTransferItem;
}

function fakeTransfer(items: DataTransferItem[], files: File[] = []): DataTransfer {
	return { items, files } as unknown as DataTransfer;
}

/** Only `name` and `webkitRelativePath` are read, so a duck type is enough. */
function withRelativePath(name: string, relative: string): File {
	return { name, webkitRelativePath: relative } as unknown as File;
}

describe("readAllEntries", () => {
	it("keeps asking until the reader is exhausted", async () => {
		// The whole point: Chrome caps a call at 100 entries, and a reader that
		// is asked only once would lose everything past the first batch.
		const children = [fakeFile("a"), fakeFile("b"), fakeFile("c"), fakeFile("d"), fakeFile("e")];
		const reader = (fakeDirectory("dir", children, 2) as unknown as FileSystemDirectoryEntry).createReader();
		const entries = await readAllEntries(reader);
		expect(entries.map((entry) => entry.name)).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("resolves an empty directory to nothing", async () => {
		const reader = (fakeDirectory("empty", []) as unknown as FileSystemDirectoryEntry).createReader();
		expect(await readAllEntries(reader)).toEqual([]);
	});
});

describe("traverseEntry", () => {
	it("reports a bare file under its own name", async () => {
		const tree = await traverseEntry(fakeFile("notes.txt"));
		expect(tree.files.map((entry) => entry.path)).toEqual(["notes.txt"]);
		expect(tree.directories).toEqual([]);
	});

	it("prefixes nested files with the folders they came from", async () => {
		const tree = await traverseEntry(
			fakeDirectory("docs", [fakeFile("a.md"), fakeDirectory("sub", [fakeFile("b.md")])]),
		);
		expect(tree.files.map((entry) => entry.path)).toEqual(["docs/a.md", "docs/sub/b.md"]);
		expect(tree.directories).toEqual(["docs", "docs/sub"]);
	});

	it("keeps a directory that holds no files", async () => {
		const tree = await traverseEntry(fakeDirectory("drop", [fakeDirectory("bare", [])]));
		expect(tree.files).toEqual([]);
		expect(tree.directories).toEqual(["drop", "drop/bare"]);
	});
});

describe("directoriesOf", () => {
	it("derives every level a relative path passes through", () => {
		const files = pickedFiles([withRelativePath("c.md", "docs/sub/c.md"), withRelativePath("a.md", "a.md")]);
		expect(directoriesOf(files)).toEqual(["docs", "docs/sub"]);
	});
});

describe("directoriesToCreate", () => {
	it("orders parents before children and drops duplicates", () => {
		expect(directoriesToCreate(["b", "a/b/c", "a", "a/b", "b"])).toEqual(["a", "b", "a/b", "a/b/c"]);
	});

	it("ignores empty names", () => {
		expect(directoriesToCreate(["", "docs"])).toEqual(["docs"]);
	});
});

describe("targetPath", () => {
	it("joins the browsing directory with a relative path", () => {
		expect(targetPath("/waynecos", "docs/a.md")).toBe("/waynecos/docs/a.md");
	});

	it("does not double the slash at the root", () => {
		expect(targetPath("/", "a.md")).toBe("/a.md");
		expect(targetPath("/waynecos/", "a.md")).toBe("/waynecos/a.md");
	});
});

describe("pickedFiles", () => {
	it("prefers the folder-relative path when the picker provides one", () => {
		expect(pickedFiles([withRelativePath("a.md", "docs/a.md")])[0].path).toBe("docs/a.md");
	});

	it("falls back to the file name for a plain file picker", () => {
		expect(pickedFiles([withRelativePath("a.md", "")])[0].path).toBe("a.md");
	});

	it("returns the directories a folder pick implies", () => {
		expect(pickedTree([withRelativePath("a.md", "docs/a.md")]).directories).toEqual(["docs"]);
	});
});

describe("droppedTree", () => {
	it("walks dropped directories", async () => {
		const transfer = fakeTransfer([fakeItem(fakeDirectory("docs", [fakeFile("a.md")]))]);
		const tree = await droppedTree(transfer);
		expect(tree.files.map((entry) => entry.path)).toEqual(["docs/a.md"]);
		expect(tree.directories).toEqual(["docs"]);
	});

	it("collects several dropped entries", async () => {
		const transfer = fakeTransfer([fakeItem(fakeFile("a.txt")), fakeItem(fakeDirectory("docs", [fakeFile("b.md")]))]);
		const tree = await droppedTree(transfer);
		expect(tree.files.map((entry) => entry.path)).toEqual(["a.txt", "docs/b.md"]);
	});

	it("falls back to the flat file list when no entry is available", async () => {
		const transfer = fakeTransfer([fakeItem(null)], [withRelativePath("a.md", "")]);
		const tree = await droppedTree(transfer);
		expect(tree.files.map((entry) => entry.path)).toEqual(["a.md"]);
	});

	it("ignores non-file items", async () => {
		const text = { kind: "string", webkitGetAsEntry: () => null } as unknown as DataTransferItem;
		const tree = await droppedTree(fakeTransfer([text], [withRelativePath("a.md", "")]));
		expect(tree.files.map((entry) => entry.path)).toEqual(["a.md"]);
	});
});

/**
 * Turning a drop — or a folder picker — into a flat list of files to upload.
 *
 * A dropped directory arrives as a tree of `FileSystemEntry` objects that has to
 * be walked by hand, and the walk has one trap worth naming: `readEntries` is
 * not guaranteed to return every child in a single call. Chrome hands back at
 * most 100 entries and expects the caller to keep asking until it gets an empty
 * array, so `readAllEntries` loops until exhaustion. Stopping after the first
 * call silently drops the rest of the directory.
 *
 * Files keep their path *relative to the drop root* instead of having it folded
 * into the name, so the file name stays a real name — it is what the error
 * messages quote and what the server stores.
 */

/** A file plus the path it should keep below the upload directory. */
export type DroppedFile = { file: File; path: string };

/** Everything a drop produced: the files, and every directory that held them. */
export type DroppedTree = { files: DroppedFile[]; directories: string[] };

function fileOf(entry: FileSystemFileEntry): Promise<File> {
	return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/**
 * Reads a directory to exhaustion.
 *
 * `readEntries` may not be called again until its callback has run, which is why
 * the next batch is requested from inside the callback rather than in a loop.
 */
export function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
	const collected: FileSystemEntry[] = [];
	return new Promise((resolve, reject) => {
		function read() {
			reader.readEntries((batch) => {
				if (!batch.length) {
					resolve(collected);
					return;
				}
				collected.push(...batch);
				read();
			}, reject);
		}
		read();
	});
}

/** Walks one entry, returning the files below it and the directories it crossed. */
export async function traverseEntry(entry: FileSystemEntry, prefix = ""): Promise<DroppedTree> {
	if (entry.isFile) {
		const file = await fileOf(entry as FileSystemFileEntry);
		return { files: [{ file, path: prefix + entry.name }], directories: [] };
	}
	const path = prefix + entry.name;
	const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
	const nested = await Promise.all(children.map((child) => traverseEntry(child, `${path}/`)));
	return {
		// The directory is recorded even when it turns out to be empty, so a
		// dropped tree keeps its shape instead of losing its bare branches.
		directories: [path, ...nested.flatMap((tree) => tree.directories)],
		files: nested.flatMap((tree) => tree.files),
	};
}

/** Every directory implied by a set of relative file paths. */
export function directoriesOf(files: readonly DroppedFile[]): string[] {
	const directories = new Set<string>();
	for (const { path } of files) {
		const parts = path.split("/").filter(Boolean);
		parts.pop();
		for (let depth = 1; depth <= parts.length; depth++) {
			directories.add(parts.slice(0, depth).join("/"));
		}
	}
	return [...directories];
}

export function pickedFiles(files: FileList | readonly File[]): DroppedFile[] {
	return Array.from(files, (file) => ({
		file,
		// A folder picker fills this in with the path below the picked root; a
		// plain file picker leaves it empty.
		path: file.webkitRelativePath || file.name,
	}));
}

/** The `<input type="file">` counterpart of `droppedTree`. */
export function pickedTree(files: FileList | readonly File[]): DroppedTree {
	const list = pickedFiles(files);
	return { files: list, directories: directoriesOf(list) };
}

export async function droppedTree(dataTransfer: DataTransfer): Promise<DroppedTree> {
	// `dataTransfer` is only readable while the drop handler is running, so
	// everything below this line is read before the first `await`.
	const entries = Array.from(dataTransfer.items ?? [])
		.filter((item) => item.kind === "file")
		.map((item) => item.webkitGetAsEntry())
		.filter((entry): entry is FileSystemEntry => entry !== null);
	// The entry API is the only way to see inside a dropped folder; where it is
	// missing, the flat file list is still a usable drop.
	if (!entries.length) return pickedTree(dataTransfer.files);
	const trees = await Promise.all(entries.map((entry) => traverseEntry(entry)));
	return { files: trees.flatMap((tree) => tree.files), directories: trees.flatMap((tree) => tree.directories) };
}

/**
 * The directories that must exist before the files land, parents first.
 *
 * `fs/mkdir` creates exactly one level per call — its `create_parent` flag walks
 * *upwards*, which on S3 would write a directory-marker object for every
 * ancestor including the mount root. Sorting by depth instead means each
 * directory is created only after the one that holds it, and nothing above the
 * upload directory is ever touched.
 */
export function directoriesToCreate(directories: readonly string[]): string[] {
	return [...new Set(directories)]
		.filter(Boolean)
		.sort((left, right) => depthOf(left) - depthOf(right) || left.localeCompare(right));
}

function depthOf(path: string): number {
	return path.split("/").filter(Boolean).length;
}

/** Joins the directory being browsed with a path relative to it. */
export function targetPath(directory: string, relative: string): string {
	return `${directory.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
}

import { readFile } from "./api";

/**
 * Saving a file to disk.
 *
 * This is subtler than it looks, and it was broken: the bytes are fetched through
 * `readFile` because `/d/*` authenticates by header (an `<a href="/d/…">` would be
 * a 401), then handed to the browser as an object URL. Building the anchor,
 * pointing it at the blob and calling `.click()` is not enough:
 *
 * - **The anchor has to be in the document.** A detached `<a>` downloads in
 *   Chromium, which is why this appeared to work in development, but Firefox and
 *   Safari ignore the click on a node that is not in the tree. One line — append,
 *   click, remove — is the difference between a working download and a silent
 *   no-op in two of the three engines.
 * - **The object URL has to outlive the click.** Revoking it in the same tick
 *   cancels the transfer in some browsers; the delay below is deliberate.
 *
 * Both live here rather than in each caller: four copies of this pattern had
 * drifted — two of them appended the anchor and two did not.
 */
export async function saveFile(path: string, name: string): Promise<void> {
	const response = await readFile(path);
	const blob = await response.blob();
	saveBlob(blob, name);
}

/** The same, for bytes that are already in hand. */
export function saveBlob(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.rel = "noopener";
	link.style.display = "none";
	// Attached for the click, removed immediately after: Firefox and Safari only
	// honour a download from an element that is in the document.
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Long enough for the transfer to start in every engine, short enough that the
	// blob is not pinned for the life of the tab.
	setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * A filename for a browser save, from a path.
 *
 * The last segment, with anything a filesystem would refuse replaced. A name is
 * user data, and a slash or a NUL in it is not a filename. Control characters are
 * matched by code point rather than by a `[\x00-\x1f]` range, because a literal
 * range of those in a regex is a lint error and, more to the point, unreadable.
 */
export function nameFromPath(path: string): string {
	const last = path.split("/").filter(Boolean).pop() ?? "download";
	let cleaned = "";
	for (const char of last) {
		const code = char.codePointAt(0) ?? 0;
		cleaned += code < 32 || '\\/:*?"<>|'.includes(char) ? "_" : char;
	}
	return cleaned;
}

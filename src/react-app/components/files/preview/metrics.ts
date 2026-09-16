/**
 * How a preview panel is measured.
 *
 * The previewer is one dialog that shows six kinds of file, and each viewer used
 * to decide its own size: an image had a 240px floor, a PDF a fixed 640, the
 * editor a third number and the markdown view a fifth. Opening a folder and
 * stepping through it resized the dialog on every file — the same dialog,
 * apparently a different thing each time.
 *
 * A viewer composes its frame from these instead. `PANEL` is for the viewers
 * whose content fills a panel; the ones that are inherently small — the audio
 * player, the notice that no previewer exists, and the empty-file notice — take
 * the frame without a height, because a 640px box around a 40px control, or
 * around one sentence, is worse than a dialog that resizes.
 *
 * The radius is stated once too. It has not changed here; the point is that a
 * frame which always appears beside another frame cannot drift away from it.
 */

/** A panel sized by the dialog rather than by the file. */
export const PANEL = "h-[min(68vh,640px)] min-h-[360px]";

/** The surface, radius and edge of a frame. */
export const FRAME = "rounded-lg border border-border";

/** A recessed well: for content the viewer is showing rather than writing. */
export const WELL = "bg-surface-secondary";

/** The page surface: for text the user is reading, where a document belongs. */
export const PAGE = "bg-surface";

/** Padding inside a frame. */
export const PAD = "p-5";

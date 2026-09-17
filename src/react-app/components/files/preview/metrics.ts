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
 * The radius is stated once too. It has not changed here — `rounded-lg` is the
 * same class it always was, though it now resolves to 5px rather than 8px — and
 * the point is that a frame which always appears beside another frame cannot
 * drift away from it. It lives in `FRAME_RADIUS` rather than inside `FRAME`
 * because the two skeleton fallbacks draw a frame's corner without its border.
 */

/** A panel sized by the dialog rather than by the file. */
export const PANEL = "h-[min(68vh,640px)] min-h-[360px]";

/**
 * The corner of a frame, on its own.
 *
 * `FRAME` includes it, and the two skeleton fallbacks that stand in for a frame
 * before it has loaded take this instead of `FRAME` — they have no border to
 * draw. That is the whole reason it is a separate export: the radius of a frame
 * used to be written in three places, and this file is meant to be the one place
 * a preview's geometry is decided.
 */
export const FRAME_RADIUS = "rounded-lg";

/** The surface, radius and edge of a frame. */
export const FRAME = `${FRAME_RADIUS} border border-border`;

/** A recessed well: for content the viewer is showing rather than writing. */
export const WELL = "bg-surface-secondary";

/** The page surface: for text the user is reading, where a document belongs. */
export const PAGE = "bg-surface";

/** Padding inside a frame. */
export const PAD = "p-5";

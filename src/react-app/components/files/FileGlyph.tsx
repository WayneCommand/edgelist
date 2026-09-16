import { isMountPoint } from "../../lib/mask";
import type { FileItem } from "../../lib/types";
import { DatabaseIcon, FileIcon, FolderIcon, type IconProps } from "../common/icons";

/** The three things a listing entry can be, as far as its glyph is concerned. */
type GlyphKind = "mount" | "folder" | "file";

const GLYPHS = { mount: DatabaseIcon, folder: FolderIcon, file: FileIcon } as const;

/**
 * Only a mount point takes the accent colour. The other two share a neutral, so
 * the colour is what says "this one is a storage, not a folder you can rename".
 */
const TONES: Record<GlyphKind, string> = {
	mount: "text-accent",
	folder: "text-muted",
	file: "text-muted",
};

function glyphKindOf(item: FileItem): GlyphKind {
	if (isMountPoint(item)) return "mount";
	return item.is_dir ? "folder" : "file";
}

/**
 * The glyph a listing shows for an entry.
 *
 * A mount point gets its own symbol rather than the folder glyph, because the
 * two behave differently: rename, move and remove are refused on a mount point
 * and allowed on a folder, so the difference has to be visible before the click.
 *
 * Shared, so the table and the grid cannot drift apart on this the way
 * `fileDescription` stops them drifting on the text beside it.
 */
export function FileGlyph({ item, className = "size-6", strokeWidth }: { item: FileItem } & IconProps) {
	const kind = glyphKindOf(item);
	const Glyph = GLYPHS[kind];
	return <Glyph className={`${className} ${TONES[kind]}`} strokeWidth={strokeWidth} />;
}

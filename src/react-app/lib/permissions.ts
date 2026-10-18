/**
 * What the current selection permits, and why not.
 *
 * Pure functions over `ObjMask` bits plus the rules that are the client's own.
 * Both the bulk bar (§6.2) and the context menu (§6.4) read one answer from here,
 * so an action cannot be offered in one place and refused in the other.
 *
 * This is a *hint for the interface*, never enforcement: the Worker re-checks
 * every write against the mask and the metadata rules, and is the authority. The
 * point of the copy below is that a greyed-out button should say why.
 */

import { ObjMask, type FileObject } from "./types";
import { parentOf } from "./paths";
import type { MessageKey } from "./i18n";

export type ActionName = "open" | "rename" | "copy" | "move" | "remove" | "download" | "link" | "share" | "extract";
export type Permission = { allowed: boolean; reason?: MessageKey };
export type Permissions = Record<ActionName, Permission>;

const OK: Permission = { allowed: true };
const denied = (reason: MessageKey): Permission => ({ allowed: false, reason });

export function blocks(mask: number | undefined, bit: number): boolean {
	return Boolean((mask ?? 0) & bit);
}

/**
 * Whether an entry is a mount point rather than an ordinary folder.
 *
 * The Worker marks a real mount `OBJ_LOCKED | Virtual` and an intermediate level
 * that only exists to reach a nested mount `OBJ_READ_ONLY | Virtual`. Both carry
 * `Virtual`, so that bit alone cannot tell them apart — `NoWrite` does, because a
 * mount point can be written through and an intermediate cannot.
 */
export function isMountPoint(item: { mask?: number }): boolean {
	return blocks(item.mask, ObjMask.Virtual) && !blocks(item.mask, ObjMask.NoWrite);
}

/** Whether a directory exists only to reach a nested mount. */
export function isMountLayer(path: string, mounts: readonly string[]): boolean {
	const prefix = path === "/" ? "" : path.replace(/\/+$/, "");
	return mounts.some((mount) => mount !== path && mount.startsWith(`${prefix}/`));
}

/** Whether an entry can be renamed, moved, copied or removed at all. */
export function isLocked(item: FileObject): boolean {
	return blocks(item.mask, ObjMask.NoRename) && blocks(item.mask, ObjMask.NoRemove);
}

/**
 * Why a directory cannot receive new entries, or `null` when it can.
 *
 * `mounts` is `null` while the list is unknown, and unknown stays *permissive*:
 * a failed read is not the same answer as "nothing is mounted", and treating it as
 * the latter would lock every write button on a transient error while the server
 * would have accepted the write.
 *
 * The remaining way a write fails — a `NoWrite` mask or a metadata rule on a real
 * storage — is only knowable server-side, which answers 403.
 */
export function unwritableReason(path: string, mounts: readonly string[] | null): MessageKey | null {
	if (!mounts) return null;
	const normalized = path === "/" ? "" : path.replace(/\/+$/, "");
	const served = mounts.some((mount) => {
		if (mount === "/") return true;
		const candidate = mount.replace(/\/+$/, "");
		return normalized === candidate || normalized.startsWith(`${candidate}/`);
	});
	// The root is an aggregate over the mounts beneath it rather than a storage,
	// so a write there always fails — but it reads better named as itself.
	if (served && normalized !== "") return null;
	return "toolbar.no_mount";
}

function transferPermission(items: readonly FileObject[], kind: "copy" | "move"): Permission {
	// A transfer names one source directory, so a selection spanning directories
	// — what a search produces — has nothing to send.
	if (new Set(items.map((item) => parentOf(item.path))).size > 1) {
		return denied(kind === "copy" ? "permission.copy_one_folder" : "permission.move_one_folder");
	}
	if (items.some((item) => blocks(item.mask, ObjMask.Virtual))) return denied("permission.virtual_transfer");
	if (items.some((item) => blocks(item.mask, kind === "copy" ? ObjMask.NoCopy : ObjMask.NoMove)))
		return denied(kind === "copy" ? "permission.no_copy" : "permission.no_move");
	// A move deletes the original, so `NoRemove` blocks it even without `NoMove`.
	if (kind === "move" && items.some((item) => blocks(item.mask, ObjMask.NoRemove))) return denied("permission.move_no_remove");
	return OK;
}

/** What the current selection permits. */
export function permissionsFor(items: readonly FileObject[]): Permissions {
	const nothing = items.length === 0;
	const single = items.length === 1 ? items[0] : null;
	const empty = denied("permission.nothing_selected");
	const archives = items.length > 0 && items.every((item) => !item.is_dir && /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|zst|iso)$/i.test(item.name));

	return {
		open: single ? OK : denied("permission.open_one"),
		rename: single
			? blocks(single.mask, ObjMask.NoRename)
				? denied("permission.no_rename")
				: OK
			: denied("permission.rename_one"),
		copy: nothing ? empty : transferPermission(items, "copy"),
		move: nothing ? empty : transferPermission(items, "move"),
		remove: nothing
			? empty
			: items.some((item) => blocks(item.mask, ObjMask.NoRemove))
				? denied("permission.no_remove")
				: OK,
		// No archive writer, so a selection holding a directory cannot be fetched
		// in one go. Refusing is clearer than downloading nothing.
		download: nothing ? empty : items.some((item) => item.is_dir) ? denied("permission.no_archive") : OK,
		link: single ? (single.is_dir ? denied("permission.no_folder_link") : OK) : denied("permission.link_one"),
		share: single && !single.is_dir ? OK : denied("permission.share_one_file"),
		extract: archives ? OK : denied("permission.not_all_archives"),
	};
}

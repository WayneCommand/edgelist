import { t } from "./locale";
import { parentOf } from "./paths";
import type { FileItem } from "./types";

/**
 * Mirrors the worker's `ObjMask` (`src/worker/storage/types.ts`, itself taken
 * from OpenList's `internal/model/obj.go`). A listing ships these bits so the
 * client can grey out what the server would refuse anyway — the mask is a hint
 * for the UI, never the enforcement, which stays server-side.
 */
export const ObjMask = {
	Virtual: 1 << 0,
	NoRename: 1 << 1,
	NoRemove: 1 << 2,
	NoMove: 1 << 3,
	NoCopy: 1 << 4,
	NoWrite: 1 << 5,
	Temp: 1 << 6,
} as const;

/** A mount point: you can write through it, but not rename/remove/move it. */
export const OBJ_LOCKED = ObjMask.NoRename | ObjMask.NoRemove | ObjMask.NoMove;

/** An intermediate level that only exists to reach a nested mount. */
export const OBJ_READ_ONLY = OBJ_LOCKED | ObjMask.NoWrite;

export function blocks(mask: number | undefined, bit: number): boolean {
	return Boolean((mask ?? 0) & bit);
}

export type ActionName = "open" | "rename" | "copy" | "move" | "remove" | "download" | "link";

/** Whether an action is available, and if not, why — the reason goes in a tooltip. */
export type Permission = { allowed: boolean; reason?: string };

export type Permissions = Record<ActionName, Permission>;

const OK: Permission = { allowed: true };

function denied(reason: string): Permission {
	return { allowed: false, reason };
}

function transferPermission(items: FileItem[], kind: "copy" | "move"): Permission {
	// A transfer names one source directory, so a selection spanning several
	// directories — what a search produces — has nothing to send.
	if (new Set(items.map((item) => parentOf(item.path))).size > 1) {
		return denied(t(kind === "copy" ? "permission.copyOneFolder" : "permission.moveOneFolder"));
	}
	if (items.some((item) => blocks(item.mask, ObjMask.Virtual))) {
		return denied(t("permission.virtualTransfer"));
	}
	if (items.some((item) => blocks(item.mask, kind === "copy" ? ObjMask.NoCopy : ObjMask.NoMove))) {
		return denied(t(kind === "copy" ? "permission.noCopy" : "permission.noMove"));
	}
	// A move deletes the original, so `NoRemove` blocks it even without `NoMove`.
	if (kind === "move" && items.some((item) => blocks(item.mask, ObjMask.NoRemove))) {
		return denied(t("permission.moveNoRemove"));
	}
	return OK;
}

/**
 * What the current selection permits, with the reason behind every refusal.
 *
 * Mask bits cover rename/remove/move, but three rules are the client's own: the
 * transfer planner refuses a virtual mount whatever the bits say, a move is
 * also blocked by `NoRemove` because it deletes the original, and only one
 * entry at a time can be renamed. Directories have no link, and without an
 * archive driver they cannot be downloaded either.
 *
 * The context menu, the action bar and the table all read this, so the same
 * action cannot be available in one place and greyed out in another.
 */
export function permissionsFor(items: FileItem[]): Permissions {
	const nothing = items.length === 0;
	const single = items.length === 1 ? items[0] : null;
	const empty = denied(t("permission.nothingSelected"));

	return {
		open: single ? OK : denied(t("permission.openOne")),
		rename: single
			? blocks(single.mask, ObjMask.NoRename)
				? denied(t("permission.noRename"))
				: OK
			: denied(t("permission.renameOne")),
		copy: nothing ? empty : transferPermission(items, "copy"),
		move: nothing ? empty : transferPermission(items, "move"),
		remove: nothing
			? empty
			: items.some((item) => blocks(item.mask, ObjMask.NoRemove))
				? denied(t("permission.noRemove"))
				: OK,
		// Archives are not implemented, so a selection holding a directory cannot
		// be fetched in one go. Refusing is clearer than downloading nothing.
		download: nothing ? empty : items.some((item) => item.is_dir) ? denied(t("permission.noArchive")) : OK,
		link: single ? (single.is_dir ? denied(t("permission.noFolderLink")) : OK) : denied(t("permission.linkOne")),
	};
}

/**
 * Whether a directory exists only to reach a nested mount.
 *
 * The worker auto-creates the intermediate levels of a nested mount and marks
 * them `OBJ_READ_ONLY`, but a listing does not carry the current directory's own
 * mask. The mount list is enough to recognise them: a path that is a strict
 * prefix of a mount is one of those levels.
 */
export function isMountLayer(path: string, mounts: readonly string[]): boolean {
	const prefix = path === "/" ? "" : path.replace(/\/+$/, "");
	return mounts.some((mount) => mount !== path && mount.startsWith(`${prefix}/`));
}

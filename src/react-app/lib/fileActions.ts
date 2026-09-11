import type { ActionName, Permissions } from "./mask";
import type { MenuItem } from "./menu";

/** One handler per action name, so the menu table stays a plain lookup. */
export type FileActionHandlers = Record<ActionName, () => void>;

const MENU: ReadonlyArray<{ label: string; action: ActionName; danger?: boolean; separatorBefore?: boolean }> = [
	{ label: "Open", action: "open" },
	{ label: "Rename", action: "rename" },
	{ label: "Copy", action: "copy" },
	{ label: "Move", action: "move" },
	{ label: "Download", action: "download" },
	{ label: "Copy link", action: "link" },
	{ label: "Delete", action: "remove", danger: true, separatorBefore: true },
];

/**
 * The file menu, built from the very permissions the action bar reads, so the
 * two cannot disagree about what is possible. A disabled entry carries its
 * reason as a tooltip.
 */
export function fileActions(permissions: Permissions, handlers: FileActionHandlers): MenuItem[] {
	return MENU.map(({ label, action, danger, separatorBefore }) => {
		const permission = permissions[action];
		return {
			label,
			onSelect: handlers[action],
			disabled: !permission.allowed,
			title: permission.reason,
			danger,
			separatorBefore,
		};
	});
}

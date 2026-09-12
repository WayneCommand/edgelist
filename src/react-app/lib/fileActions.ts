import type { MessageKey } from "./i18n";
import { t } from "./locale";
import type { ActionName, Permissions } from "./mask";
import type { MenuItem } from "./menu";

/** One handler per action name, so the menu table stays a plain lookup. */
export type FileActionHandlers = Record<ActionName, () => void>;

// Keys rather than labels: the table is built once at module load, and the
// language can change afterwards, so the text has to be resolved per call.
const MENU: ReadonlyArray<{ label: MessageKey; action: ActionName; danger?: boolean; separatorBefore?: boolean }> = [
	{ label: "action.open", action: "open" },
	{ label: "action.rename", action: "rename" },
	{ label: "action.copy", action: "copy" },
	{ label: "action.move", action: "move" },
	{ label: "action.download", action: "download" },
	{ label: "action.copyLink", action: "link" },
	{ label: "action.delete", action: "remove", danger: true, separatorBefore: true },
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
			label: t(label),
			onSelect: handlers[action],
			disabled: !permission.allowed,
			title: permission.reason,
			danger,
			separatorBefore,
		};
	});
}

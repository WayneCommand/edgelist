/** Shape and geometry of a right-click menu. */

/** One entry in a context menu. */
export type MenuItem = {
	label: string;
	onSelect: () => void;
	disabled?: boolean;
	/** Explains a disabled entry — a greyed item with no reason is a dead end. */
	title?: string;
	danger?: boolean;
	separatorBefore?: boolean;
};

/** Where a right click landed, in viewport coordinates. */
export type MenuPosition = { x: number; y: number };

const MENU_WIDTH = 224; // w-56
const MENU_MAX_HEIGHT = 320;
const MARGIN = 8;

/**
 * Keeps the menu inside the viewport without measuring it: the width is fixed
 * and the height is capped, so the clamp only needs those constants.
 */
export function menuPosition(
	position: MenuPosition,
	viewport: { width: number; height: number } = { width: 0, height: 0 },
): { left: number; top: number } {
	if (!viewport.width || !viewport.height) return { left: position.x, top: position.y };
	return {
		left: Math.max(MARGIN, Math.min(position.x, viewport.width - MENU_WIDTH - MARGIN)),
		top: Math.max(MARGIN, Math.min(position.y, viewport.height - MENU_MAX_HEIGHT - MARGIN)),
	};
}

import { useEffect } from "react";
import { type MenuItem, type MenuPosition, menuPosition } from "../../lib/menu";

type ContextMenuProps = {
	position: MenuPosition;
	items: MenuItem[];
	onClose: () => void;
};

/**
 * A right-click menu at the pointer.
 *
 * The whole viewport is covered by a transparent backdrop, which is what closes
 * the menu on the next click — including a right click, so a second right click
 * moves the menu instead of stacking one on top of another.
 */
export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const viewport = typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight };
	const { left, top } = menuPosition(position, viewport);

	return (
		<div
			className="fixed inset-0 z-30"
			onClick={onClose}
			onContextMenu={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<ul
				role="menu"
				style={{ left, top }}
				className="fixed max-h-80 w-56 overflow-auto rounded-xl border border-border bg-overlay py-1 shadow-lg"
			>
				{items.map((item) => (
					<li key={item.label} role="none">
						{item.separatorBefore && <hr className="my-1 border-separator" />}
						<button
							type="button"
							role="menuitem"
							disabled={item.disabled}
							title={item.title}
							onClick={() => {
								item.onSelect();
								onClose();
							}}
							className={`tap block w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
								item.danger ? "text-danger enabled:hover:bg-danger-soft" : "enabled:hover:bg-surface-secondary"
							}`}
						>
							{item.label}
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

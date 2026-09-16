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
			{/* The surface follows HeroUI's own menu: a 24px panel with a 4px inset,
			    so a highlighted row ends inside the corner instead of slicing
			    through it, and a shadow rather than a border carries the edge. */}
			<ul
				role="menu"
				style={{ left, top }}
				className="fixed flex max-h-80 w-56 flex-col gap-1 overflow-auto rounded-3xl bg-overlay p-1 shadow-overlay"
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
							className={`tap flex min-h-9 w-full items-center rounded-2xl px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
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

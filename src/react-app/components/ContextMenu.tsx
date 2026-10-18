import { useEffect, useRef } from "react";
import { Icon, type IconName } from "../ui/Icon";

/**
 * The right-click menu (§6.4).
 *
 * Hand-positioned at the pointer rather than anchored to the row, because the spec's
 * menu follows the cursor: it opens where the click landed, and clamps itself inside
 * the viewport. A popover library that anchors to a trigger would open against the row
 * and, for a right click near the bottom of the window, push the row instead of the
 * menu.
 *
 * Two behaviours are load-bearing:
 *
 * - **The clamp.** A menu opened at the bottom-right corner has to flip, or it renders
 *   off-screen. The width and maximum height are constants here, so the arithmetic
 *   does not need to measure anything before the first paint.
 * - **Dismissal.** Escape, a click anywhere else, a scroll, and the window losing focus
 *   all close it. A menu that survives a scroll is showing actions for a row that has
 *   moved out from under it.
 */
export type MenuEntry = {
	label: string;
	icon?: IconName;
	onSelect: () => void;
	/** Renders in the danger colour. */
	danger?: boolean;
	/** A rule above this entry. */
	separatorBefore?: boolean;
	/** A key hint drawn on the right of the row. */
	hint?: string;
};

export function ContextMenu({
	position,
	entries,
	onClose,
}: {
	position: { x: number; y: number };
	entries: MenuEntry[];
	onClose: () => void;
}) {
	const menu = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function dismiss(event: MouseEvent) {
			if (menu.current?.contains(event.target as Node)) return;
			onClose();
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		// `capture` on the pointer: a menu opened over a scrollable list has to close
		// before the list scrolls, not after.
		window.addEventListener("mousedown", dismiss);
		window.addEventListener("keydown", onKey);
		window.addEventListener("scroll", onClose, true);
		window.addEventListener("blur", onClose);
		return () => {
			window.removeEventListener("mousedown", dismiss);
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("scroll", onClose, true);
			window.removeEventListener("blur", onClose);
		};
	}, [onClose]);

	// §6.4: the menu follows the theme, so it is a surface, not a fixed dark panel.
	const WIDTH = 224;
	const MAX_HEIGHT = 320;
	const GAP = 8;
	const left =
		typeof window === "undefined" ? position.x : Math.max(GAP, Math.min(position.x, window.innerWidth - WIDTH - GAP));
	const top =
		typeof window === "undefined"
			? position.y
			: Math.max(GAP, Math.min(position.y, window.innerHeight - MAX_HEIGHT - GAP));

	return (
		<div
			ref={menu}
			role="menu"
			aria-orientation="vertical"
			className="arrive fixed z-popover flex max-h-80 flex-col overflow-y-auto rounded-lg border border-border bg-overlay p-1 shadow-lg [--arrive-duration:120ms] [--arrive-scale:0.96]"
			style={{ left, top, width: WIDTH }}
			// The menu is inside the document, so a right click on it must not
			// re-open the browser menu.
			onContextMenu={(event) => event.preventDefault()}
		>
			{entries.map((entry) => (
				<div key={entry.label}>
					{entry.separatorBefore && <div className="my-1 h-px bg-hairline" />}
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							entry.onSelect();
							onClose();
						}}
						className={`tap flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-row-hover ${
							entry.danger ? "text-danger-11" : "text-foreground"
						}`}
					>
						{entry.icon ? (
							<Icon name={entry.icon} className="size-4 shrink-0 text-neutral-11" />
						) : (
							<span className="size-4 shrink-0" />
						)}
						<span className="flex-1">{entry.label}</span>
						{entry.hint && <span className="text-[11px] text-neutral-9">{entry.hint}</span>}
					</button>
				</div>
			))}
		</div>
	);
}

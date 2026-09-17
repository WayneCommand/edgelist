import { useCallback, useEffect, useRef, useState } from "react";
import { type MenuItem, type MenuPosition, menuPosition } from "../../lib/menu";

type ContextMenuProps = {
	position: MenuPosition;
	items: MenuItem[];
	onClose: () => void;
};

/** Matches the exit animation below, which is what actually runs for that long. */
const EXIT_MS = 100;

/**
 * A right-click menu at the pointer.
 *
 * The whole viewport is covered by a transparent backdrop, which is what closes
 * the menu on the next click — including a right click, so a second right click
 * moves the menu instead of stacking one on top of another.
 *
 * The menu moves the way HeroUI's own overlays do: 150ms fade and zoom in from
 * the corner it opened at, 100ms back out. A right-click is instant feedback, so
 * this is the library's recipe rather than anything heavier — and it is the
 * library's, not an invention, because a menu that animates differently from
 * every other overlay in the app is worse than one that does not animate at all.
 */
export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
	// Leaving is a two-step: the menu marks itself as going, then unmounts when
	// the animation would have finished. Something has to own that delay, and the
	// parent cannot — it decides whether a menu exists, not whether one is still
	// on its way out.
	const [exiting, setExiting] = useState(false);
	const leaving = useRef(false);

	const close = useCallback(() => {
		// A click on a menu entry also lands on the backdrop behind it, so this is
		// reached twice for one intent. Only the first one gets to schedule.
		if (leaving.current) return;
		leaving.current = true;
		setExiting(true);
		window.setTimeout(onClose, EXIT_MS);
	}, [onClose]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") close();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [close]);

	const viewport = typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight };
	const { left, top } = menuPosition(position, viewport);

	return (
		<div
			className="fixed inset-0 z-menu"
			onClick={close}
			onContextMenu={(event) => {
				event.preventDefault();
				close();
			}}
		>
			{/* The surface follows HeroUI's own menu: an 18px panel, a 6px inset and
			    12px rows, so a highlighted row ends inside the corner instead of
			    slicing through it, and a shadow rather than a border carries the
			    edge.
			
			    The inset is the knob. With the ladder's 3xl panel and 2xl row the corner
			    band comes out even exactly when `inset = --radius`
			    (band = outer − inset − inner = 3r − r − 2r), which is where the 6px comes
			    from — it replaced a fixed 4px when the radius went up, because an inset
			    that does not follow the knob widens the band by exactly what the knob
			    moved. On the two ways to miss: smaller than outer-minus-inset only reads
			    as a slightly tighter corner, while larger widens the band — and a
			    near-miss at concentric reads as "did not line up" where a clear
			    difference reads as deliberate.

			    `fill-mode-forwards` holds the faded-out state until the timeout
			    unmounts the menu. Without it the exit animation ends by snapping
			    back to fully drawn for however long is left of those 100ms. */}
			<ul
				role="menu"
				style={{ left, top }}
				className={`fixed flex max-h-80 w-56 origin-top-left flex-col gap-1 overflow-auto rounded-3xl bg-overlay p-1.5 shadow-overlay motion-reduce:animate-none ${
					exiting
						? "animate-out fill-mode-forwards duration-100 ease-smooth zoom-out-95 fade-out"
						: "animate-in duration-150 ease-smooth fade-in-0 zoom-in-90"
				}`}
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
								close();
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

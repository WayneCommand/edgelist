/**
 * The EdgeList wordmark, for the sign-in page's header.
 *
 * The app shell sets its own lockup inline — mark plus `<span>` — because it
 * needs the button around them. The sign-in page's header is not a button and
 * has a different arrangement (mark left of the name, both in the header's own
 * row), so the two are not the same component and sharing one would mean a
 * component with a `as` prop and two branches.
 *
 * The name is spelled once, here and in `App.tsx`, rather than exported from a
 * constant: two call sites and a brand that has changed names once already is
 * not a drift risk worth a shared module, and a `PRODUCT_NAME` in `lib/` would
 * have to be imported by a component whose whole job is to render two things.
 */
export function Wordmark() {
	return (
		<div className="flex items-center gap-2.5">
			<span
				aria-hidden="true"
				className="flex size-8 items-center justify-center rounded-[25%] bg-foreground text-sm font-bold text-background"
			>
				E
			</span>
			<span className="text-title font-semibold tracking-tight">EdgeList</span>
		</div>
	);
}

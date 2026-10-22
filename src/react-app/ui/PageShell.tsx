import type { ReactNode } from "react";

/**
 * The page column (§3.2).
 *
 * `min(99%, 1000px)`, centred, and it is the only thing that decides a page's
 * width or its horizontal gutters. §3.2 is explicit that the header, the
 * breadcrumb, the object card and the footer all sit in this one container "so
 * the four share their left and right edges" — which is why this is a component
 * and not a class string repeated in four places: earlier those four each
 * subtracted their own padding, giving three different left edges eight pixels
 * apart, and a header at full viewport width above a 980px card.
 *
 * Padding is on the container rather than on each child, so a child cannot
 * widen itself by adding gutters of its own.
 */
export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
	return (
		<div className={`mx-auto flex min-h-dvh w-full max-w-[1000px] flex-col px-5 sm:px-7 ${className}`}>{children}</div>
	);
}

/**
 * The window's background.
 *
 * macOS does not use one flat colour, and glass over a flat colour looks like
 * nothing at all — there is nothing for the blur to refract. So the window is a
 * soft wallpaper: a pale blue field, a warm bloom low-left, a cool one high-right.
 * The cards then read as panes *over* something, which is the entire point of the
 * material.
 *
 * Deliberately low contrast. A vivid wallpaper behind translucent cards makes text
 * unreadable; Apple's own are desaturated for exactly this reason.
 *
 * `bare` is for a page that paints its own wallpaper (the sign-in screen does, with
 * §10.1's arcs). The wrapper is still rendered so the z-index slot is consistent,
 * but nothing opaque is painted — an opaque fill here would sit *over* the page's
 * own background and flatten it back to grey.
 */
export function WindowBackdrop({ bare = false }: { bare?: boolean }) {
	if (bare) return null;
	return (
		<div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
			<div className="absolute inset-0 bg-page" />
			{/* Two blooms, in the corners the eye reads as light sources. */}
			<div className="absolute -top-[30%] -right-[15%] size-[70vmax] rounded-full bg-[radial-gradient(circle,var(--bloom-cool)_0%,transparent_68%)]" />
			<div className="absolute -bottom-[35%] -left-[20%] size-[65vmax] rounded-full bg-[radial-gradient(circle,var(--bloom-warm)_0%,transparent_68%)]" />
			{/* The top light: a shallow white wash that gives the chrome something to
			    catch, and that keeps the very top of the window brighter than the foot. */}
			<div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(to_bottom,var(--page-top),transparent)]" />
		</div>
	);
}

/**
 * A card: the surface a list, a table or a preview sits on (§3.5).
 *
 * `glass-panel` rather than a white rectangle — a translucent fill over a blur,
 * with a hairline edge and a specular rim. The shadow is shallow on purpose: on a
 * translucent surface a deep shadow reads as a detached panel, and Apple's cards
 * sit *in* the window rather than on top of it.
 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
	return (
		<div className={`glass-panel overflow-hidden rounded-2xl border border-hairline shadow-sm ${className}`}>
			{children}
		</div>
	);
}

/**
 * A page footer (§3.7).
 *
 * The same "EdgeList | Manage" line the browser page has always drawn, now
 * shared, because the management pages were each ending without one — a page
 * that stops mid-air reads as unfinished.
 */
export function PageFooter({ children }: { children?: ReactNode }) {
	return (
		<footer className="flex items-center justify-center gap-2 py-6 text-[12px] text-neutral-10">
			{children ?? <span>EdgeList</span>}
		</footer>
	);
}

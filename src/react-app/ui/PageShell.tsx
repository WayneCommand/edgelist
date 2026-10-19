import type { ReactNode } from "react";

/**
 * The page column (§3.2).
 *
 * `min(99%, 980px)`, centred, and it is the only thing that decides a page's width
 * or its horizontal gutters. §3.2 is explicit that the header, the breadcrumb, the
 * object card and the footer all sit in this one container "so the four share their
 * left and right edges" — which is why this is a component and not a class string
 * repeated in four places: earlier those four each subtracted their own padding,
 * giving three different left edges eight pixels apart, and the header the full
 * viewport width above a 980px card.
 *
 * Padding is on the container rather than on each child, so a child cannot widen
 * itself by adding a gutters of its own.
 */
export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
	return (
		<div className={`mx-auto flex w-full max-w-[980px] flex-col gap-3 px-[calc(2%+0.5rem)] ${className}`}>
			{children}
		</div>
	);
}

/**
 * A card: the white surface a list, a table or a preview sits on (§3.5).
 *
 * One radius, one background, one border. The spec's cards have no shadow — the page
 * is `#f7f8fa` so that white reads as raised already — and giving them one made the
 * page look like a dashboard of floating panels rather than one surface.
 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
	return <div className={`overflow-hidden rounded-xl border border-border bg-surface ${className}`}>{children}</div>;
}

/**
 * A page footer (§3.7).
 *
 * The same "Powered by OpenList | Manage" line the browser page has always drawn, now
 * shared, because the management pages were each ending without one — a page that
 * stops mid-air reads as unfinished, and the line is the only place the deployment
 * says what it is.
 */
export function PageFooter({ children }: { children?: ReactNode }) {
	return (
		<footer className="flex items-center justify-center gap-2 py-6 text-[13px] text-neutral-10">
			{children ?? <span>Powered by OpenList</span>}
		</footer>
	);
}

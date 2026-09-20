import type { ReactNode } from "react";

/**
 * The app's icon set: one SVG family, drawn on a 24 grid, in `currentColor`.
 *
 * Everything here is a hand-written path rather than a dependency, and that is
 * deliberate. Before this file the vocabulary was emoji (`💾` `📁` `📄`) mixed
 * with typed symbols (`↑` `‹` `✎` `▾` `▸`), which cannot be recoloured per
 * state: an emoji is a coloured glyph, so a selected row could not tint its own
 * icon, and the two families carry visibly different optical weight in one row.
 *
 * Three rules the set keeps:
 *
 * - `currentColor` only. Never a hard-coded fill, so state comes from the
 *   element's colour and no icon needs a second asset.
 * - One stroke weight per weight of text. The default is 1.5px, which sits with
 *   regular text; `strokeWidth` is there for the places that need 2px beside
 *   semibold text.
 * - `data-icon` names the glyph. It is what the smoke tests assert on, since a
 *   decorative icon is `aria-hidden` and has no accessible handle.
 *
 * Icon-only buttons take their accessible name from the button itself
 * (`aria-label`), which is why every icon here is hidden from assistive tech.
 */

export type IconProps = {
	className?: string;
	strokeWidth?: number;
};

function Icon({
	name,
	className = "size-4",
	strokeWidth = 1.5,
	children,
}: IconProps & { name: string; children: ReactNode }) {
	return (
		<svg
			data-icon={name}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
		>
			{children}
		</svg>
	);
}

/* ---------------------------------------------------------------- listings */

/** A folder. */
export function FolderIcon(props: IconProps) {
	return (
		<Icon name="folder" {...props}>
			<path d="M4 7a2 2 0 0 1 2-2h3l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
		</Icon>
	);
}

/** A file, drawn as a sheet with a folded corner. */
export function FileIcon(props: IconProps) {
	return (
		<Icon name="file" {...props}>
			<path d="M13.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
			<path d="M13.5 3v5.5H19" />
		</Icon>
	);
}

/**
 * A stack of discs, for a storage mount.
 *
 * A mount point needs to stop looking like an ordinary folder: rename, move and
 * remove are refused on one and allowed on the other, so the difference has to
 * be visible in the listing rather than discovered by a failed click.
 */
export function DatabaseIcon(props: IconProps) {
	return (
		<Icon name="database" {...props}>
			<path d="M4.5 6.25a7.5 3.25 0 1 0 15 0a7.5 3.25 0 1 0-15 0" />
			<path d="M4.5 6.25v11.5a7.5 3.25 0 0 0 15 0V6.25" />
			<path d="M4.5 12a7.5 3.25 0 0 0 15 0" />
		</Icon>
	);
}

/* ------------------------------------------------------------------ arrows */

export function ArrowUpIcon(props: IconProps) {
	return (
		<Icon name="arrow-up" {...props}>
			<path d="M12 19V5" />
			<path d="M6 11l6-6 6 6" />
		</Icon>
	);
}

export function ArrowDownIcon(props: IconProps) {
	return (
		<Icon name="arrow-down" {...props}>
			<path d="M12 5v14" />
			<path d="M6 13l6 6 6-6" />
		</Icon>
	);
}

export function ChevronLeftIcon(props: IconProps) {
	return (
		<Icon name="chevron-left" {...props}>
			<path d="M15 5l-7 7 7 7" />
		</Icon>
	);
}

export function ChevronRightIcon(props: IconProps) {
	return (
		<Icon name="chevron-right" {...props}>
			<path d="M9 5l7 7-7 7" />
		</Icon>
	);
}

/* ----------------------------------------------------------------- actions */

export function PencilIcon(props: IconProps) {
	return (
		<Icon name="pencil" {...props}>
			<path d="M16.5 4.5a2.12 2.12 0 0 1 3 3L8 19l-4.5 1.5L5 16z" />
			<path d="M14.5 6.5l3 3" />
		</Icon>
	);
}

export function FolderPlusIcon(props: IconProps) {
	return (
		<Icon name="folder-plus" {...props}>
			<path d="M4 7a2 2 0 0 1 2-2h3l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
			<path d="M12 11.5v5" />
			<path d="M9.5 14h5" />
		</Icon>
	);
}

export function FolderUpIcon(props: IconProps) {
	return (
		<Icon name="folder-up" {...props}>
			<path d="M4 7a2 2 0 0 1 2-2h3l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
			<path d="M12 16.5V11.5" />
			<path d="M9.5 13.5L12 11l2.5 2.5" />
		</Icon>
	);
}

export function UploadIcon(props: IconProps) {
	return (
		<Icon name="upload" {...props}>
			<path d="M12 15.5V4" />
			<path d="M7.5 8.5L12 4l4.5 4.5" />
			<path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
		</Icon>
	);
}

export function RefreshIcon(props: IconProps) {
	return (
		<Icon name="refresh" {...props}>
			<path d="M20.5 12a8.5 8.5 0 0 1-14.7 5.8L3.5 16" />
			<path d="M3.5 20v-4h4" />
			<path d="M3.5 12a8.5 8.5 0 0 1 14.7-5.8L20.5 8" />
			<path d="M20.5 4v4h-4" />
		</Icon>
	);
}

/** A tray with nothing in it, for the empty states. */
export function InboxIcon(props: IconProps) {
	return (
		<Icon name="inbox" {...props}>
			<path d="M3.5 12.5l2.2-7A1.5 1.5 0 0 1 7.1 4.5h9.8a1.5 1.5 0 0 1 1.4 1l2.2 7V17a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
			<path d="M3.5 12.5h4.2l1.3 2.5h6l1.3-2.5h4.2" />
		</Icon>
	);
}

/* --------------------------------------------------------------- sign-in */

/**
 * Two figures hand in hand, for the privacy notice.
 *
 * The design sheet describes it as a "极简的双人（手拉手）图标" — the glyph Apple
 * puts beside the sentence about who a credential is shared with. Drawn as two
 * head-and-shoulder pairs with a short bar between them, and the bar is the
 * load-bearing part: without it the two figures read as a queue rather than as
 * a pair, which is the opposite of what the sentence says.
 */
export function PrivacyIcon(props: IconProps) {
	return (
		<Icon name="privacy" {...props}>
			<circle cx="7.5" cy="7" r="2.75" />
			<path d="M2.75 19v-.75a4 4 0 0 1 4-4h1.5a4 4 0 0 1 4 4V19" />
			<circle cx="16.5" cy="7" r="2.75" />
			<path d="M21.25 19v-.75a4 4 0 0 0-4-4h-1.5" />
			<path d="M11.25 12.75h1.5" />
		</Icon>
	);
}

/**
 * A key beside a face, for the passkey button.
 *
 * Two glyphs in one 24 grid rather than a key alone, because the button's whole
 * claim is *which kind* of credential this is: a bare key would be a generic
 * "credentials" action next to a field that also takes credentials. The face is
 * deliberately the smaller of the two.
 */
export function PasskeyIcon(props: IconProps) {
	return (
		<Icon name="passkey" {...props}>
			<circle cx="7" cy="8" r="3.25" />
			<path d="M1.75 19.25v-.5a4.25 4.25 0 0 1 4.25-4.25h2a4.25 4.25 0 0 1 4.25 4.25v.5" />
			<circle cx="16.5" cy="12" r="2.25" />
			<path d="M18.75 12h3.5" />
			<path d="M20.5 12v2.5" />
			<path d="M22.25 12v1.75" />
		</Icon>
	);
}

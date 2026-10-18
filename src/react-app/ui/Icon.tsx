import type { CSSProperties } from "react";

/**
 * The app's icon set: one SVG family on a 24 grid, in `currentColor`.
 *
 * Every glyph is a hand-written path rather than a dependency, for two reasons.
 * The spec calls for icons that take the colour of the state they are in — a
 * hovered tool button turns its icon white — and an icon *font* or an emoji
 * cannot do that. And a set of 60 glyphs is about 8 KB of paths, which is less
 * than the smallest icon package and has none of its tree-shaking caveats.
 *
 * One component with a name table rather than one exported component per glyph:
 * the call sites read `<Icon name="folder" />`, and a glyph that is only used
 * once is a row in the table rather than a file. The table is typed, so a typo
 * is a compile error instead of an empty square.
 *
 * Rules the set keeps:
 *
 * - stroke 1.5 at 24px, matching regular text weight; `strokeWidth` is there for
 *   the two places that sit beside semibold text.
 * - `data-icon` names the glyph. Decorative icons are `aria-hidden`, so that
 *   attribute is the only handle a test has.
 * - `fill` is `none` unless a glyph opts in, so a glyph can be solid (the play
 *   triangle) without a second component.
 */
const PATHS = {
	"alert-circle": "M12 8v5M12 16.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
	"alert-triangle": "M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z M12 9v4M12 16.5v.01",
	archive: "M3 8.5h18M4 8.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V8.5M3 4.5h18v4H3zM10 12.5h4",
	"arrow-down": "M12 4v16M6 14l6 6 6-6",
	"arrow-left": "M20 12H4M10 18l-6-6 6-6",
	"arrow-right": "M4 12h16M14 6l6 6-6 6",
	"arrow-up": "M12 20V4M6 10l6-6 6 6",
	"arrow-up-right": "M7 17 17 7M8 7h9v9",
	"check": "M4 12.5 9 17.5 20 6.5",
	"check-circle": "M8 12.5 11 15.5 16.5 9.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
	"chevron-down": "M6 9.5 12 15.5 18 9.5",
	"chevron-left": "M15 5.5 8.5 12 15 18.5",
	"chevron-right": "M9 5.5 15.5 12 9 18.5",
	"chevron-up": "M6 14.5 12 8.5 18 14.5",
	"chevrons-up-down": "M8 9.5 12 5.5 16 9.5M8 14.5 12 18.5 16 14.5",
	clipboard: "M9 4.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2M9 3h6v3H9z",
	clock: "M12 7v5l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
	close: "M6 6l12 12M18 6 6 18",
	command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z",
	copy: "M9 9.5h9.5A1.5 1.5 0 0 1 20 11v9.5H10.5A1.5 1.5 0 0 1 9 19zM15 6.5V4.5A1.5 1.5 0 0 0 13.5 3H4.5A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15h2",
	database: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
	download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15",
	"expand-all": "M4 8.5 9 3.5l5 5M9 3.5v9M20 15.5l-5 5-5-5M15 20.5v-9",
	"external-link": "M14 4.5h5.5V10M19.5 4.5 11 13M17 14v5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V8.5A1.5 1.5 0 0 1 5 7h5",
	eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
	"eye-off": "M4 4l16 16M9.9 5.9A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.8M6.5 8.1A17.3 17.3 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5M10.2 10.4a2.5 2.5 0 0 0 3.5 3.5",
	"file-archive": "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18M9 11.5h2M9 14.5h2M9 17.5h2",
	"file-audio": "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18M14 12.5v3.6M14 16.1a1.4 1.4 0 1 1-1.4-1.4M14 12.5l-2.5.7",
	"file-code": "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18M9.5 13 8 15l1.5 2M14 13l1.5 2-1.5 2",
	"file-image": "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18M8.5 15.5l2.5-3 2 2.2 1.5-1.6 2 2.4M9 12.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
	"file-pdf": "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18M9 16.5v-4h1.2a1.3 1.3 0 0 1 0 2.6H9",
	"file-text": "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18M9 13h6M9 16.5h4",
	"file-video": "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18M11 12.5l3.5 2-3.5 2z",
	file: "M6 3.5h7.5l4.5 4.5v12.5H6zM13 3.5v5H18",
	folder: "M3.5 7a2 2 0 0 1 2-2h3l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
	"folder-arrow": "M3.5 7a2 2 0 0 1 2-2h3l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM9 13.5h6M13 11l2.5 2.5-2.5 2.5",
	"folder-open": "M3.5 7a2 2 0 0 1 2-2h3l2 2.5h8a2 2 0 0 1 2 2v2M3.5 9.5v8a2 2 0 0 0 2 2h12.2a2 2 0 0 0 1.9-1.4l1.6-5.1a1 1 0 0 0-1-1.3H6.2a2 2 0 0 0-1.9 1.4z",
	"folder-plus": "M3.5 7a2 2 0 0 1 2-2h3l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM12 10.5v5M9.5 13h5",
	"folder-search": "M3.5 7a2 2 0 0 1 2-2h3l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM12 11.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM13.6 15.1 15.5 17",
	"folder-up": "M3.5 7a2 2 0 0 1 2-2h3l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM12 17v-5M9.5 14.5 12 12l2.5 2.5",
	gauge: "M12 20a8 8 0 1 1 4.9-14.3M12 12l4-3.5M4.5 12.5h1.6M11.2 4.6v1.6M18.9 8.2l-1.1 1.1",
	globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3.4 9.5h17.2M3.4 14.5h17.2M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9s1.1-6.6 3.3-9Z",
	grid: "M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z",
	"hard-drive": "M3.5 13.5h17M6 16.5h.01M9.5 16.5h.01M4.8 5.6 3.5 13.5v4a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4l-1.3-7.9A1.5 1.5 0 0 0 17.7 4.5H6.3a1.5 1.5 0 0 0-1.5 1.1Z",
	home: "M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z",
	image: "M4.5 4.5h15v15h-15zM4.5 16l4-4.5 3 3.2 2.5-2.6 5.5 5.4M9 10a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z",
	info: "M12 11v6M12 7.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
	key: "M15.5 8.5a3.5 3.5 0 1 1-2.6 5.8L4.5 19.5l-1.5-1.5 1-1-1-1 1.5-1.5 1 1 1.5-1.5M15.5 8.5h.01",
	layers: "M12 3.5 3.5 8l8.5 4.5L20.5 8zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5",
	link: "M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8A4 4 0 0 0 12.8 5L11 6.8M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8A4 4 0 0 0 11.2 19l1.8-1.8",
	list: "M4 6.5h16M4 12h16M4 17.5h16",
	"list-ordered": "M4 6.5h5M4 12h5M4 17.5h5M12 6.5h8M12 12h8M12 17.5h8",
	logout: "M15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20h8a1.5 1.5 0 0 0 1.5-1.5V16M10 12h10.5M17.5 8.5 21 12l-3.5 3.5",
	"magnet": "M6 4.5v7a6 6 0 0 0 12 0v-7M6 8.5h4M14 8.5h4M6 4.5h4M14 4.5h4",
	maximize: "M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15",
	menu: "M4 7h16M4 12h16M4 17h16",
	minimize: "M9 4.5V9H4.5M15 4.5V9h4.5M19.5 15H15v4.5M4.5 15H9v4.5",
	minus: "M5 12h14",
	"more-horizontal": "M6 12h.01M12 12h.01M18 12h.01",
	"more-vertical": "M12 6v.01M12 12v.01M12 18v.01",
	moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z",
	move: "M3.5 7a2 2 0 0 1 2-2h3l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM9 13.5h6M12.5 11l2.5 2.5-2.5 2.5",
	pause: "M8.5 5v14M15.5 5v14",
	pencil: "M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14.5 6.5l3 3",
	play: "M8 5.5v13l11-6.5z",
	plus: "M12 5v14M5 12h14",
	"refresh": "M20 11a8 8 0 1 0-.6 4M20 5.5V11h-5.5",
	"rotate-left": "M4 10.5h5V5.5M4 10.5a8 8 0 1 1 2.4 8.4",
	"rotate-right": "M20 10.5h-5V5.5M20 10.5a8 8 0 1 0-2.4 8.4",
	search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM15.4 15.4 20.5 20.5",
	settings: "M4 7h7M15 7h5M4 12h3M11 12h9M4 17h9M17 17h3M13 5v4M9 10v4M15 15v4",
	share: "M12 3.5v11M8.5 7 12 3.5 15.5 7M5 13.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-5.5",
	"shield": "M12 3.5 4.5 6.5v5.7c0 4 3.1 6.9 7.5 8.3 4.4-1.4 7.5-4.3 7.5-8.3V6.5z",
	sliders: "M6 20V13M6 9V4M12 20v-9M12 7V4M18 20v-5M18 11V4M3.5 11h5M9.5 7h5M15.5 15h5",
	sort: "M8 5v14M4.5 15.5 8 19l3.5-3.5M16 19V5M12.5 8.5 16 5l3.5 3.5",
	sparkles: "M12 3.5l1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7zM18 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
	stop: "M6.5 6.5h11v11h-11z",
	sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2.5V5M12 19v2.5M4.5 12H2M22 12h-2.5M6.3 6.3 4.6 4.6M19.4 19.4l-1.7-1.7M17.7 6.3l1.7-1.7M4.6 19.4l1.7-1.7",
	tag: "M4 11V5.5A1.5 1.5 0 0 1 5.5 4H11l9 9-7 7zM8 8h.01",
	trash: "M4.5 6.5h15M9 6.5V4.5h6v2M6.5 6.5 7.5 20h9l1-13.5M10 10v6.5M14 10v6.5",
	upload: "M12 16V4.5M7.5 9 12 4.5 16.5 9M4.5 19.5h15",
	user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
	video: "M4 6.5h11a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V8A1.5 1.5 0 0 1 4 6.5ZM16.5 10.5l5-3v9l-5-3",
	x: "M6 6l12 12M18 6 6 18",
	"zoom-in": "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM15.4 15.4 20.5 20.5M10.5 7.5v6M7.5 10.5h6",
	"zoom-out": "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM15.4 15.4 20.5 20.5M7.5 10.5h6",
} as const;

export type IconName = keyof typeof PATHS;

/** Glyphs drawn as a filled shape rather than a stroke. */
const FILLED: ReadonlySet<IconName> = new Set<IconName>([
	"play",
	"pause",
	"more-horizontal",
	"more-vertical",
	"stop",
	"command",
]);

export type IconProps = {
	name: IconName;
	/** Tailwind sizing classes. Defaults to 1rem, which sits with body text. */
	className?: string;
	strokeWidth?: number;
	style?: CSSProperties;
};

export function Icon({ name, className = "size-4", strokeWidth = 1.5, style }: IconProps) {
	const filled = FILLED.has(name);
	return (
		<svg
			data-icon={name}
			viewBox="0 0 24 24"
			fill={filled ? "currentColor" : "none"}
			stroke={filled ? "none" : "currentColor"}
			strokeWidth={filled ? undefined : strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			className={className}
			style={style}
		>
			{/* `more-*` and `command` are dot-based, so a path cannot describe
			    them; the few glyphs that need circles get them here rather than
			    forcing every other glyph through a second representation. */}
			{name === "more-horizontal" && (
				<>
					<circle cx="5" cy="12" r="1.9" />
					<circle cx="12" cy="12" r="1.9" />
					<circle cx="19" cy="12" r="1.9" />
				</>
			)}
			{name === "more-vertical" && (
				<>
					<circle cx="12" cy="5" r="1.9" />
					<circle cx="12" cy="12" r="1.9" />
					<circle cx="12" cy="19" r="1.9" />
				</>
			)}
			{name !== "more-horizontal" && name !== "more-vertical" && <path d={PATHS[name]} />}
		</svg>
	);
}

/**
 * The modifier key this platform uses, for the two shortcut hints the spec draws
 * (`⌘K` on a Mac, `Ctrl K` elsewhere).
 *
 * Read once at module load: a platform does not change while a page is open, and
 * a hook here would add a subscription to every component that shows a hint.
 */
export const MOD_KEY =
	typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
		? "⌘"
		: "Ctrl";

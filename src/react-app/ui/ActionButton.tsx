import type { ReactNode } from "react";
import { Button as HeroButton } from "@heroui/react";
import { Icon, type IconName } from "./Icon";

/**
 * The app's button, wrapping HeroUI's with the vocabulary §2.2 defines.
 *
 * Five weights, and the mapping matters:
 *
 * - `primary` — the solid main colour (cyan). One per surface: login, submit.
 * - `accent` — violet. The second most important action: refresh, a random
 *   password, the "pre" of a dangerous pair.
 * - `soft` — the ordinary button: light fill, dark text. This is the default,
 *   because §2.2 makes it the default and a page with five solid buttons has no
 *   hierarchy.
 * - `danger` — red, for something that destroys.
 * - `ghost` — no fill until hovered. Icon buttons in a toolbar.
 *
 * Sizes are the spec's recommended ladder (24/32/40/48/56), trimmed to the three
 * this interface actually uses; `md` is the default.
 *
 * The wrapper exists rather than calling `HeroButton` directly because a variant
 * name is a decision that should be made once: `variant="primary"` reads nothing
 * like `variant="solid"`, and a page that names its weight in the library's words
 * would encode the library into every call site. There are three exceptions where
 * that does not pay — the error-state pages, the drawers and the modal chrome —
 * where the HeroUI component is used directly because it is chrome, not content.
 */
export type ButtonTone = "primary" | "accent" | "soft" | "danger" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const TONE: Record<ButtonTone, { variant: "primary" | "secondary" | "tertiary" | "danger" | "ghost" | "outline"; className: string }> = {
	// Solid cyan. `--primary-9` is bound as the library's `primary`, but the
	// library's `primary` variant paints the *accent* (blue), so the cyan has to
	// be stated here.
	primary: { variant: "primary", className: "bg-primary-9 text-white hover:bg-primary-10" },
	accent: { variant: "primary", className: "bg-accent-9 text-white hover:bg-accent-10" },
	soft: { variant: "secondary", className: "" },
	danger: { variant: "danger", className: "" },
	ghost: { variant: "ghost", className: "" },
	outline: { variant: "outline", className: "" },
};

const SIZE: Record<ButtonSize, string> = {
	sm: "h-8 px-3 text-[13px] gap-1.5",
	md: "h-10 px-4 text-sm gap-2",
	lg: "h-12 px-5 text-[15px] gap-2",
};

type ActionButtonProps = {
	children?: ReactNode;
	tone?: ButtonTone;
	size?: ButtonSize;
	icon?: IconName;
	/** Renders a square button with no label. `aria-label` becomes required. */
	iconOnly?: boolean;
	onPress?: () => void;
	type?: "button" | "submit";
	isDisabled?: boolean;
	isPending?: boolean;
	fullWidth?: boolean;
	className?: string;
	"aria-label"?: string;
	title?: string;
};

export function ActionButton({
	children,
	tone = "soft",
	size = "md",
	icon,
	iconOnly = false,
	onPress,
	type = "button",
	isDisabled,
	isPending,
	fullWidth,
	className = "",
	...rest
}: ActionButtonProps) {
	const { variant, className: toneClass } = TONE[tone];
	return (
		<HeroButton
			type={type}
			variant={variant}
			size={size === "lg" ? "md" : size}
			isIconOnly={iconOnly}
			isDisabled={isDisabled || isPending}
			isPending={isPending}
			fullWidth={fullWidth}
			onPress={onPress}
			className={`${iconOnly ? "size-8 px-0" : SIZE[size]} ${toneClass} font-medium ${className}`}
			{...rest}
		>
			{/* A pending button shows the spinner where its icon was, so the width
			    does not change and the label stays readable. */}
			{isPending ? null : icon ? <Icon name={icon} className={size === "sm" ? "size-3.5" : "size-4"} /> : null}
			{iconOnly ? null : children}
		</HeroButton>
	);
}

/**
 * A square icon button with a tooltip.
 *
 * §2.3: square, one glyph, no text, and the tooltip is how it names itself. The
 * hover treatment is the app's own rather than the library's — §6.1 wants the
 * background to become the main colour and the icon to turn white, which is a
 * louder affordance than a ghost button's grey wash and is what makes the floating
 * tool cluster legible over a listing.
 */
export function IconButton({
	icon,
	label,
	onPress,
	className = "",
	size = "md",
	active = false,
	tone = "ghost",
	strokeWidth,
	isDisabled,
}: {
	icon: IconName;
	label: string;
	onPress?: () => void;
	className?: string;
	size?: "sm" | "md" | "lg";
	/** Renders as pressed/toggled. */
	active?: boolean;
	tone?: "ghost" | "main";
	strokeWidth?: number;
	isDisabled?: boolean;
}) {
	const box = size === "sm" ? "size-7" : size === "lg" ? "size-10" : "size-8";
	const glyph = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
	const hover =
		tone === "main"
			? "hover:bg-main hover:text-white"
			: "hover:bg-row-hover hover:text-foreground";
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			title={label}
			disabled={isDisabled}
			onClick={onPress}
			className={`tap inline-flex shrink-0 items-center justify-center rounded-lg disabled:opacity-40 ${box} ${
				active ? "bg-main text-white" : "text-muted"
			} ${hover} ${className}`}
		>
			<Icon name={icon} className={glyph} strokeWidth={strokeWidth} />
		</button>
	);
}

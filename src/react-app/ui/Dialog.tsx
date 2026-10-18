import { useEffect, type ReactNode } from "react";
import { Modal as HeroModal } from "@heroui/react";
import { ActionButton } from "./ActionButton";

/**
 * A dialog, with the escape hatches the spec needs.
 *
 * Three of §7's modals cannot be dismissed the way the rest can: the share
 * creation, the upload and the package download refuse the backdrop, and the
 * search and the package download refuse Esc as well (§18.8, §18.11–13). So both
 * are parameters rather than fixed behaviour — a dialog that cannot be escaped has
 * to be a decision at the call site, not a flag this component guesses.
 *
 * The close button is optional for the same reason: §7.8's share modal and §7.11's
 * offline download have no ✕, so their only exits are Cancel and success.
 *
 * The library's size ladder stops at `lg` (512px), so `xl` and `2xl` — which §7
 * assigns to the destination picker and the preview modals — are stated as widths
 * on the container instead of being rounded down to `lg`.
 */
export type DialogSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const WIDTH: Partial<Record<DialogSize, string>> = {
	xl: "sm:max-w-[36rem]",
	"2xl": "sm:max-w-[42rem]",
};

const NATIVE: Partial<Record<DialogSize, "xs" | "sm" | "md" | "lg">> = {
	xs: "xs",
	sm: "sm",
	md: "md",
	lg: "lg",
	xl: "lg",
	"2xl": "lg",
};

export function Dialog({
	title,
	children,
	footer,
	onClose,
	size = "md",
	closeButton = true,
	closeOnBackdrop = true,
	closeOnEsc = true,
}: {
	title: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	onClose: () => void;
	size?: DialogSize;
	closeButton?: boolean;
	closeOnBackdrop?: boolean;
	closeOnEsc?: boolean;
}) {
	// React Aria listens for Escape on the document, so the only reliable way to
	// keep a modal open on Esc is to catch the key before it arrives. A capture
	// listener on `window` sits ahead of every bubble-phase handler the overlay
	// installs.
	useEffect(() => {
		if (closeOnEsc) return;
		const block = (event: KeyboardEvent) => {
			if (event.key === "Escape") event.stopPropagation();
		};
		window.addEventListener("keydown", block, true);
		return () => window.removeEventListener("keydown", block, true);
	}, [closeOnEsc]);

	return (
		<HeroModal>
			<HeroModal.Backdrop
				isOpen
				isDismissable={closeOnBackdrop}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
			>
				<HeroModal.Container size={NATIVE[size]} className={WIDTH[size]}>
					<HeroModal.Dialog>
						{closeButton && <HeroModal.CloseTrigger />}
						<HeroModal.Header>
							<HeroModal.Heading className="text-base font-semibold">{title}</HeroModal.Heading>
						</HeroModal.Header>
						<HeroModal.Body className="text-sm">{children}</HeroModal.Body>
						{footer && <HeroModal.Footer>{footer}</HeroModal.Footer>}
					</HeroModal.Dialog>
				</HeroModal.Container>
			</HeroModal.Backdrop>
		</HeroModal>
	);
}

/**
 * The pair every dialog ends with.
 *
 * §7's modals all close the same way — Cancel on the left in the neutral weight,
 * the confirming action on the right — and writing that pair eight times is how
 * they drift. `extra` is the left-hand slot §7.1.1 and §7.3 put a checkbox into,
 * and it is `mr-auto`, so the two buttons stay right-aligned whatever it holds.
 */
export function DialogActions({
	onCancel,
	onConfirm,
	confirmLabel,
	cancelText = "Cancel",
	extra,
	confirmTone = "soft",
	isPending,
	confirmDisabled,
	children,
}: {
	onCancel?: () => void;
	onConfirm?: () => void;
	confirmLabel: string;
	cancelText?: string;
	extra?: ReactNode;
	confirmTone?: "soft" | "primary" | "accent" | "danger";
	isPending?: boolean;
	confirmDisabled?: boolean;
	/** Extra buttons between Cancel and the confirming one. */
	children?: ReactNode;
}) {
	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			{extra}
			<div className="ml-auto flex items-center gap-2">
				{children}
				{onCancel && (
					<ActionButton tone="ghost" onPress={onCancel}>
						{cancelText}
					</ActionButton>
				)}
				<ActionButton tone={confirmTone} onPress={onConfirm} isPending={isPending} isDisabled={confirmDisabled}>
					{confirmLabel}
				</ActionButton>
			</div>
		</div>
	);
}

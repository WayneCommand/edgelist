import { useEffect, useRef } from "react";
import type { ConfirmRequest } from "../lib/feedback";
import { useT } from "../hooks/useStore";
import { ActionButton } from "./ActionButton";

/**
 * The confirmation dialog, on the platform's own `<dialog>`.
 *
 * Not the library's modal, and deliberately: this is the one dialog in the app that has to be
 * reachable from everywhere — a failed upload asks for confirmation from inside an upload
 * loop — so its chunk is fetched on first use, and the smaller that chunk is the shorter the
 * wait. `<dialog>.showModal()` gives focus trapping, Esc dismissal, `::backdrop`, and the top
 * layer for free, which is the whole of what a confirmation needs. §7.4's layout is a title, a
 * sentence and two buttons; a component library is not required to draw that.
 *
 * `::backdrop` is styled in `index.css`, because a pseudo-element cannot be reached with
 * utility classes on this element.
 */
export function ConfirmDialog({
	request,
	onResolve,
}: {
	request: ConfirmRequest;
	onResolve: (ok: boolean) => void;
}) {
	const t = useT();
	const dialog = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const node = dialog.current;
		if (!node) return;
		// `showModal` rather than the `open` attribute: only a modal dialog goes into the top
		// layer and only a modal one traps focus.
		if (!node.open) node.showModal();
		// §7.4 asks for the *confirming* action to be the one under the fingers, which for a
		// destructive dialog is the wrong default — so focus starts on Cancel. The spec's own
		// `modal` has the same problem and solves it the same way.
		node.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
		return () => {
			if (node.open) node.close();
		};
	}, []);

	return (
		<dialog
			ref={dialog}
			aria-labelledby="confirm-title"
			aria-describedby="confirm-message"
			onCancel={(event) => {
				// Esc is a refusal, not a dismissal: the promise resolves either way.
				event.preventDefault();
				onResolve(false);
			}}
			onClick={(event) => {
				// A click on the dialog's own box is a click on the backdrop, which §7.4 allows.
				if (event.target === dialog.current) onResolve(false);
			}}
			className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg bg-overlay p-0 text-overlay-foreground shadow-lg backdrop:bg-black/50"
		>
			<div className="flex flex-col gap-3 p-4">
				<h2 id="confirm-title" className="text-base font-semibold">
					{request.title}
				</h2>
				<p id="confirm-message" className="text-sm leading-relaxed text-neutral-11">
					{request.message}
				</p>
				<div className="mt-1 flex items-center justify-end gap-2">
					<span data-cancel>
						<ActionButton tone="ghost" onPress={() => onResolve(false)}>
							{t("global.cancel")}
						</ActionButton>
					</span>
					<ActionButton
						tone={request.danger ? "danger" : "soft"}
						onPress={() => onResolve(true)}
						// §7.4 wants the confirming button to take focus *last*, so Enter after
						// typing nothing does the safe thing.
						type="button"
					>
						{request.confirmLabel}
					</ActionButton>
				</div>
			</div>
		</dialog>
	);
}

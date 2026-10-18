import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogActions } from "../ui/Dialog";
import { Checkbox, Field, TextInput } from "../ui/Field";
import { useT } from "../hooks/useStore";
import { notify } from "../lib/feedback";

/**
 * The single-input dialog (§7.1), which rename, new folder and new file all share.
 *
 * One component rather than three, because the spec says they are one component and
 * because the three behaviours that matter are identical: focus the field on open,
 * select the name but not the extension when renaming a file, validate on submit, and
 * treat Enter as OK.
 *
 * Three details are worth keeping:
 *
 * **The selection strategy.** §7.1: when renaming a *file* with a dot in its name,
 * only the stem is selected, so typing replaces `report` in `report.final.pdf` and
 * leaves `.final.pdf`. Selecting everything is the behaviour that makes renaming an
 * extension an accident waiting to happen.
 *
 * **The validation.** Empty or whitespace is `Please enter`; a name containing any of
 * `/ \ ? < > * : | "` gets the character list. Both are the spec's own copy.
 *
 * **The error is reported twice.** Inline, under the field, so it is next to what has
 * to be fixed — and that is the only place. The spec's table also has a toast, but a
 * toast plus an inline message about the same keystroke is one message said twice.
 */
export function NameDialog({
	title,
	initialValue = "",
	placeholder,
	/** Select the stem only, leaving the extension (§7.1, `isRenamingFile`). */
	stemOnly = false,
	/** Renders the overwrite checkbox §7.1.1 and §7.7 put in the footer. */
	overwrite,
	onOverwriteChange,
	extra,
	hint,
	onSubmit,
	onClose,
}: {
	title: string;
	initialValue?: string;
	placeholder?: string;
	stemOnly?: boolean;
	overwrite?: boolean;
	onOverwriteChange?: (value: boolean) => void;
	extra?: ReactNode;
	hint?: ReactNode;
	onSubmit: (name: string) => Promise<void> | void;
	onClose: () => void;
}) {
	const t = useT();
	const [value, setValue] = useState(initialValue);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const field = useRef<HTMLInputElement>(null);

	// §7.1: focus, then select after a beat so the browser's own focus selection does
	// not overwrite ours.
	useEffect(() => {
		const node = field.current;
		if (!node) return;
		node.focus();
		const timer = setTimeout(() => {
			const dot = initialValue.lastIndexOf(".");
			const end = stemOnly && dot > 0 ? dot : initialValue.length;
			node.setSelectionRange(0, end);
		}, 10);
		return () => clearTimeout(timer);
	}, [initialValue, stemOnly]);

	function validate(name: string): string {
		if (!name.trim()) return t("global.empty_input");
		if (/[/\\?<>*:|"]/.test(name)) return t("global.invalid_filename_chars");
		return "";
	}

	async function submit() {
		const message = validate(value);
		setError(message);
		if (message) {
			// §7.1 asks for a warning notification on a refused submit. It is the one
			// place the spec wants a toast *and* the inline error, and it earns it:
			// the toast says the submit did nothing, which the inline message alone
			// does not.
			notify.warning(message);
			return;
		}
		setPending(true);
		try {
			await onSubmit(value.trim());
		} finally {
			setPending(false);
		}
	}

	return (
		<Dialog
			title={title}
			size="sm"
			onClose={onClose}
			footer={
				<DialogActions
					onCancel={onClose}
					onConfirm={() => void submit()}
					cancelText={t("global.cancel")}
					confirmLabel={t("global.ok")}
					isPending={pending}
					extra={
						overwrite !== undefined && onOverwriteChange ? (
							<Checkbox
								checked={overwrite}
								onChange={onOverwriteChange}
								label={t("toolbar.conflict_overwrite")}
								className="mr-auto"
							/>
						) : (
							extra && <div className="mr-auto">{extra}</div>
						)
					}
				/>
			}
		>
			<div className="flex flex-col gap-3">
				<Field label={title} error={error} hint={hint} fieldId="name-dialog-field">
					{(id) => (
						<TextInput
							id={id}
							ref={field}
							value={value}
							placeholder={placeholder}
							onChange={(event) => {
								setValue(event.target.value);
								if (error) setError(validate(event.target.value));
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void submit();
								}
							}}
						/>
					)}
				</Field>
				{overwrite === undefined && extra}
			</div>
		</Dialog>
	);
}

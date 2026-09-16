import { type FormEvent, useState } from "react";
import { useT } from "../../hooks/useLocale";
import { normalizeInputPath } from "../../lib/paths";
import { PencilIcon } from "../common/icons";

type PathBarProps = {
	/** The directory being browsed, shown as crumbs and used to seed the editor. */
	path: string;
	crumbs: Array<{ name: string; path: string }>;
	/** A search ran here, so the crumbs describe where it looked, not what is listed. */
	searching?: boolean;
	onNavigate: (path: string) => void;
};

/**
 * The breadcrumb, and the text field it turns into.
 *
 * Walking up a deep tree one crumb at a time is tedious, so the whole bar is
 * editable: click anywhere along it and the current path becomes a text field.
 * The typed path is normalised before it leaves — see `normalizeInputPath`.
 *
 * A path that turns out not to exist is not rejected here; the listing request
 * reports it, exactly as it would for a hand-typed URL, and the editor is one
 * click away again.
 */
export function PathBar({ path, crumbs, searching = false, onNavigate }: PathBarProps) {
	const t = useT();
	// Doubles as the "is the editor open" flag and the text being typed: there is
	// no draft until the user asks for one.
	const [draft, setDraft] = useState<string | null>(null);
	const editing = draft !== null;

	function submit(event: FormEvent) {
		event.preventDefault();
		const next = normalizeInputPath(draft ?? path);
		setDraft(null);
		if (next !== path) onNavigate(next);
	}

	if (editing) {
		return (
			<form className="mb-4" onSubmit={submit}>
				<input
					autoFocus
					// Uncontrolled on purpose: the field needs a starting value and then
					// belongs to the user. Driving it from state would re-render on every
					// keystroke and fight the cursor.
					defaultValue={draft}
					aria-label={t("files.path")}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") setDraft(null);
					}}
					// Clicking away abandons the edit, which is what a cancelled edit
					// should do rather than navigating somewhere unintended.
					onBlur={() => setDraft(null)}
					className="w-full px-3 py-2 text-sm"
				/>
			</form>
		);
	}

	return (
		<div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
			{searching && <span className="text-xs">{t("files.searchResultsIn")}</span>}
			<button type="button" onClick={() => onNavigate("/")} className="tint hover:text-accent">
				{t("files.root")}
			</button>
			{crumbs.map((crumb) => (
				<span key={crumb.path}>
					/{" "}
					<button type="button" onClick={() => onNavigate(crumb.path)} className="tint hover:text-accent">
						{crumb.name}
					</button>
				</span>
			))}
			<button
				type="button"
				aria-label={t("files.editPath")}
				title={t("files.editPath")}
				onClick={() => setDraft(path)}
				className="tap rounded-md px-1.5 py-0.5 text-muted hover:bg-surface-secondary hover:text-foreground"
			>
				<PencilIcon className="size-4" />
			</button>
		</div>
	);
}

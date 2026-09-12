import { useState } from "react";
import { useT } from "../../hooks/useLocale";
import { api } from "../../lib/api";
import type { DirectoryNode } from "../../lib/types";

type DirectoryTreeProps = {
	/** Currently chosen destination. */
	value: string;
	onChange: (path: string) => void;
};

/**
 * Directory picker for the transfer dialog.
 *
 * Each node asks the worker for its own children the first time it is opened,
 * so a deep storage costs one request per level the user actually expands
 * instead of one recursive walk up front.
 */
export function DirectoryTree({ value, onChange }: DirectoryTreeProps) {
	const t = useT();
	return (
		<ul className="text-sm">
			<TreeNode path="/" label={t("files.root")} depth={0} value={value} onChange={onChange} />
		</ul>
	);
}

/** Left padding that lines a row up under its parent's expander. */
function indent(depth: number, extra = 0) {
	return { paddingLeft: `${depth * 12 + extra}px` };
}

type TreeNodeProps = {
	path: string;
	label: string;
	depth: number;
	value: string;
	onChange: (path: string) => void;
};

function TreeNode({ path, label, depth, value, onChange }: TreeNodeProps) {
	const t = useT();
	const [expanded, setExpanded] = useState(false);
	const [children, setChildren] = useState<DirectoryNode[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const selected = value === path;

	async function toggle() {
		const next = !expanded;
		setExpanded(next);
		if (!next || children) return;
		setLoading(true);
		setError("");
		try {
			const nodes = await api<DirectoryNode[]>("/api/fs/dirs", {
				method: "POST",
				body: JSON.stringify({ path, depth: 1 }),
			});
			setChildren(nodes ?? []);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : t("tree.listFailed"));
		} finally {
			setLoading(false);
		}
	}

	const noteStyle = indent(depth + 1, 24);

	return (
		<li>
			<div className="flex items-center gap-1" style={indent(depth)}>
				<button
					type="button"
					onClick={() => void toggle()}
					aria-expanded={expanded}
					aria-label={expanded ? t("tree.collapse", { name: label }) : t("tree.expand", { name: label })}
					className="w-5 shrink-0 rounded text-muted hover:text-foreground"
				>
					{expanded ? "▾" : "▸"}
				</button>
				<button
					type="button"
					onClick={() => onChange(path)}
					title={path}
					className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left ${
						selected ? "bg-accent-soft font-medium text-accent-soft-foreground" : "hover:bg-surface-secondary"
					}`}
				>
					{label}
				</button>
			</div>
			{expanded && loading && (
				<p className="py-1 text-xs text-muted" style={noteStyle}>
					{t("action.loading")}
				</p>
			)}
			{expanded && error && (
				<p className="py-1 text-xs text-danger" style={noteStyle}>
					{error}
				</p>
			)}
			{expanded && !loading && children?.length === 0 && (
				<p className="py-1 text-xs text-muted" style={noteStyle}>
					{t("tree.noSubfolders")}
				</p>
			)}
			{expanded && children && children.length > 0 && (
				<ul>
					{children.map((node) => (
						<TreeNode
							key={node.path}
							path={node.path}
							label={node.name}
							depth={depth + 1}
							value={value}
							onChange={onChange}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

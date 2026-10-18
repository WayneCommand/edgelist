import { useEffect, useMemo, useState } from "react";
import { listDirectories } from "../lib/api";
import type { DirectoryNode, FileObject } from "../lib/types";
import { parentOf } from "../lib/paths";
import { useT } from "../hooks/useStore";
import { Icon } from "../ui/Icon";
import { Loading } from "../ui/Field";

/**
 * The directory tree (§3.10), the one picker every "choose a folder" surface uses.
 *
 * Two shapes in the spec — directories only, and a file tree — and the interface
 * only ever needs the first: a destination picker, the metadata path field, and the
 * sidebar. So this is one component with one job, and a second shape can be added
 * when something asks for it.
 *
 * It fetches one level at a time. `/api/fs/dirs` can return a whole subtree, but a
 * mount with ten thousand directories would make that a multi-megabyte response on
 * every dialog open; a level at a time costs a round trip per expansion and never
 * loads what nobody opened.
 *
 * **The root is named `root`.** §3.10 and §18.2: it is a literal, not a translated
 * word, and the spec says to keep it.
 */
export function DirectoryTree({
	/** The node to open on, and to mark as selected. */
	value,
	onSelect,
	/** The file layout the row uses; the tree is one column of names. */
	className = "",
}: {
	value: string;
	onSelect: (path: string) => void;
	className?: string;
}) {
	const t = useT();
	// Children by parent path. `null` means "asked for and empty"; an absent key
	// means "not asked yet", which is what an arrow checks to decide whether to fetch.
	const [children, setChildren] = useState<Record<string, DirectoryNode[] | "loading" | "error">>({});
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["/"]));
	const [root, setRoot] = useState<DirectoryNode[] | "loading" | "error">("loading");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const nodes = await listDirectories("/", 1);
				if (!cancelled) setRoot(nodes);
			} catch {
				if (!cancelled) setRoot("error");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	/**
	 * Expands every level of `value` so the current directory is visible.
	 *
	 * §3.10: "if a node's path is a prefix of the current path, expand and load it".
	 * Doing that up front is what makes the dialog open *at* the directory the user is
	 * in rather than at the root with a "keep clicking" problem.
	 */
	useEffect(() => {
		const parts = value.split("/").filter(Boolean);
		const levels = ["/", ...parts.map((_, index) => `/${parts.slice(0, index + 1).join("/")}`)];
		setExpanded((current) => new Set([...current, ...levels]));
		for (const level of levels) void loadChildren(level);
	}, [value]);

	async function loadChildren(path: string) {
		setChildren((current) => (current[path] ? current : { ...current, [path]: "loading" }));
		try {
			const nodes = await listDirectories(path, 1);
			setChildren((current) => ({ ...current, [path]: nodes }));
		} catch {
			setChildren((current) => ({ ...current, [path]: "error" }));
		}
	}

	function toggle(path: string) {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else {
				next.add(path);
				if (!children[path]) void loadChildren(path);
			}
			return next;
		});
	}

	return (
		<div className={`min-h-0 overflow-y-auto rounded-lg border border-border bg-surface p-1.5 text-sm ${className}`}>
			{root === "loading" ? (
				<div className="flex items-center justify-center py-8">
					<Loading />
				</div>
			) : root === "error" ? (
				<p className="p-3 text-xs text-danger-11">{t("home.load_failed")}</p>
			) : (
				<TreeLevel
					nodes={root}
					depth={0}
					value={value}
					expanded={expanded}
					children={children}
					onToggle={toggle}
					onSelect={onSelect}
				/>
			)}
		</div>
	);
}

function TreeLevel({
	nodes,
	depth,
	value,
	expanded,
	children,
	onToggle,
	onSelect,
}: {
	nodes: DirectoryNode[];
	depth: number;
	value: string;
	expanded: Set<string>;
	children: Record<string, DirectoryNode[] | "loading" | "error">;
	onToggle: (path: string) => void;
	onSelect: (path: string) => void;
}) {
	const t = useT();

	return (
		<>
			{/* The root row is drawn once, above the first level, because `nodes` are
			    its children and §3.10 names it `root` rather than showing `/`. */}
			{depth === 0 && (
				<TreeRow
					label={t("home.root")}
					path="/"
					depth={0}
					open={expanded.has("/")}
					selected={value === "/"}
					onToggle={() => onToggle("/")}
					onSelect={() => onSelect("/")}
					hasChildren={nodes.length > 0}
				/>
			)}
			{nodes.map((node) => {
				const state = children[node.path];
				const open = expanded.has(node.path);
				const nested = Array.isArray(state) ? state : [];
				return (
					<div key={node.path}>
						<TreeRow
							label={node.name}
							path={node.path}
							depth={depth + 1}
							open={open}
							selected={value === node.path}
							loading={state === "loading"}
							onToggle={() => onToggle(node.path)}
							onSelect={() => onSelect(node.path)}
							hasChildren={
								node.children?.length ? true : state === undefined || (Array.isArray(state) && state.length > 0)
							}
						/>
						{open && nested.length > 0 && (
							<TreeLevel
								nodes={nested}
								depth={depth + 1}
								value={value}
								expanded={expanded}
								children={children}
								onToggle={onToggle}
								onSelect={onSelect}
							/>
						)}
					</div>
				);
			})}
		</>
	);
}

function TreeRow({
	label,
	path,
	depth,
	open,
	selected,
	loading,
	onToggle,
	onSelect,
	hasChildren,
}: {
	label: string;
	path: string;
	depth: number;
	open: boolean;
	selected: boolean;
	loading?: boolean;
	onToggle: () => void;
	onSelect: () => void;
	hasChildren: boolean;
}) {
	return (
		<div
			className={`flex items-center gap-1 rounded-md ${selected ? "bg-info-8 text-white" : "hover:bg-row-hover"}`}
			style={{ paddingLeft: `${depth * 16}px` }}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-label={open ? "Collapse" : "Expand"}
				aria-expanded={open}
				disabled={!hasChildren}
				className={`tap flex size-5 shrink-0 items-center justify-center rounded disabled:opacity-0 ${
					selected ? "text-white" : "text-main"
				}`}
			>
				{loading ? (
					<Loading size="sm" />
				) : (
					<Icon
						name="chevron-right"
						className={`size-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
						strokeWidth={2.5}
					/>
				)}
			</button>
			<button
				type="button"
				onClick={onSelect}
				data-path={path}
				className={`tap flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm ${
					selected ? "" : "hover:bg-row-hover"
				}`}
			>
				<Icon name={open ? "folder-open" : "folder"} className={`size-4 shrink-0 ${selected ? "" : "text-main"}`} />
				<span className="truncate">{label}</span>
			</button>
		</div>
	);
}

/**
 * A directory tree over a listing that is already loaded.
 *
 * The sidebar (§3.9) shows the path being browsed, and the parent chain of a listing
 * is already known — so it does not need to fetch, which is why it is not the
 * component above. It is here rather than in the sidebar's own file because it is the
 * same row.
 */
export function PathTrail({
	path,
	onNavigate,
	className = "",
}: {
	path: string;
	onNavigate: (path: string) => void;
	className?: string;
}) {
	const crumbs = useMemo(() => {
		const parts = path.split("/").filter(Boolean);
		return [
			{ name: "", path: "/" },
			...parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join("/")}` })),
		];
	}, [path]);
	const t = useT();

	return (
		<div className={`flex flex-col gap-0.5 ${className}`}>
			{crumbs.map((crumb, index) => (
				<button
					key={crumb.path}
					type="button"
					onClick={() => onNavigate(crumb.path)}
					className={`tap flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] ${
						index === crumbs.length - 1 ? "bg-info-8 text-white" : "text-neutral-11 hover:bg-row-hover"
					}`}
					style={{ paddingLeft: `${8 + index * 12}px` }}
				>
					<Icon name={index === 0 ? "home" : "folder"} className="size-3.5 shrink-0" />
					<span className="truncate">{crumb.name || t("home.root")}</span>
				</button>
			))}
		</div>
	);
}

/** A `FileObject`'s parent, for the tree's default selection. */
export function treeSelectionFor(items: readonly FileObject[]) {
	if (!items.length) return "/";
	return parentOf(items[0].path);
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { searchFiles } from "../lib/api";
import type { SearchResult } from "../lib/types";
import { formatSize, kindOf } from "../lib/format";
import { parentOf } from "../lib/paths";
import { useT } from "../hooks/useStore";
import { ROUTES } from "../routes";
import { ActionButton } from "../ui/ActionButton";
import { Dialog } from "../ui/Dialog";
import { Loading, Select } from "../ui/Field";
import { Icon } from "../ui/Icon";

/**
 * Search (§7.13).
 *
 * A dialog rather than a page, because that is what the spec describes: a scope
 * selector, a query, a result list, and a page bar, all over the listing you were
 * looking at. It stays open while you open a result, which is what makes it usable for
 * a second search.
 *
 * The scope is the Worker's own encoding — `0` all, `1` folders, `2` files — and the
 * search is a *scan*, not an index: `/api/fs/search` walks up to `max_dirs` directories
 * to `max_depth` levels. That is why the result carries `truncated`, and why the dialog
 * says so when it is set rather than presenting a partial scan as a complete answer.
 *
 * §18.13: Esc does not close this one.
 */
const PAGE_SIZE = 100;

export function SearchDialog({ startPath, onClose }: { startPath: string; onClose: () => void }) {
	const t = useT();
	const navigate = useNavigate();
	const [scope, setScope] = useState("0");
	const [query, setQuery] = useState("");
	const [result, setResult] = useState<SearchResult | null>(null);
	const [page, setPage] = useState(1);
	const [searching, setSearching] = useState(false);
	const [error, setError] = useState("");
	const input = useRef<HTMLInputElement>(null);

	// §7.13: the field takes focus on open.
	useEffect(() => {
		input.current?.focus();
	}, []);

	async function run(nextPage = 1) {
		const keywords = query.trim();
		if (!keywords) return;
		setSearching(true);
		setError("");
		setPage(nextPage);
		try {
			const data = await searchFiles({
				parent: startPath,
				keywords,
				scope: Number(scope),
				page: nextPage,
				per_page: PAGE_SIZE,
			});
			setResult(data);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : t("home.search_failed"));
		} finally {
			setSearching(false);
		}
	}

	const total = result?.total ?? 0;
	const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	return (
		<Dialog
			title={t("search.search")}
			size="2xl"
			onClose={onClose}
			closeOnEsc={false}
			footer={
				pages > 1 ? (
					<div className="flex w-full items-center justify-center gap-1">
						<ActionButton tone="ghost" size="sm" isDisabled={page <= 1} onPress={() => void run(page - 1)}>
							{t("preview.previous")}
						</ActionButton>
						<span className="numeric px-2 text-xs text-neutral-11">
							{page} / {pages}
						</span>
						<ActionButton tone="ghost" size="sm" isDisabled={page >= pages} onPress={() => void run(page + 1)}>
							{t("preview.next")}
						</ActionButton>
					</div>
				) : undefined
			}
		>
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2">
					<Select
						value={scope}
						onChange={(event) => setScope(event.target.value)}
						className="w-32"
						aria-label={t("search.search")}
					>
						<option value="0">{t("search.scopes.all")}</option>
						<option value="1">{t("search.scopes.folder")}</option>
						<option value="2">{t("search.scopes.file")}</option>
					</Select>
					<input
						ref={input}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && query.trim()) void run(1);
						}}
						placeholder={t("search.placeholder")}
						aria-label={t("search.placeholder")}
						className="h-10 min-w-0 flex-1 px-3 text-sm"
					/>
					<ActionButton
						tone="accent"
						icon="search"
						iconOnly
						aria-label={t("search.search")}
						isDisabled={!query.trim()}
						isPending={searching}
						onPress={() => void run(1)}
					/>
				</div>

				<div className="min-h-40">
					{searching ? (
						<div className="flex items-center justify-center py-12">
							<Loading size="lg" />
						</div>
					) : error ? (
						<p className="py-8 text-center text-sm text-danger-11">{error}</p>
					) : !result ? (
						<p className="py-12 text-center text-2xl text-neutral-9">{t("search.no_result")}</p>
					) : result.content.length === 0 ? (
						<p className="py-12 text-center text-2xl text-neutral-9">{t("search.no_result")}</p>
					) : (
						<>
							{result.truncated && (
								<p className="mb-2 rounded-md bg-warning-3 px-2 py-1 text-[11px] text-warning-11">
									{t("search.truncated")}
								</p>
							)}
							<div className="flex flex-col">
								{result.content.map((hit) => (
									<button
										key={hit.path}
										type="button"
										onClick={() => {
											navigate(ROUTES.files(hit.path));
											onClose();
										}}
										className="tint flex flex-col gap-0.5 border-b border-hairline px-2 py-2 text-left last:border-0 hover:bg-row-hover"
									>
										<span className="flex w-full items-center gap-2">
											<Icon
												name={hit.is_dir ? "folder" : kindOf(hit.name) === "image" ? "file-image" : "file"}
												className="size-6 shrink-0 text-main"
												strokeWidth={1.25}
											/>
											<span className="min-w-0 flex-1 truncate text-sm">{highlight(hit.name, query)}</span>
											{(!hit.is_dir || hit.size > 0) && (
												<span className="numeric shrink-0 rounded bg-info-3 px-1.5 py-0.5 text-[11px] text-info-11">
													{formatSize(hit.size)}
												</span>
											)}
										</span>
										<span className="pl-8 text-[11px] text-neutral-10">{parentOf(hit.path) || "/"}</span>
									</button>
								))}
							</div>
						</>
					)}
				</div>
			</div>
		</Dialog>
	);
}

/**
 * Marks the query inside a name (§7.13).
 *
 * Case-insensitive and per word, which is what makes a scan's results readable: the
 * user typed three words and wants to see where each one landed. Accent folding is not
 * attempted — the match itself is the Worker's `toLocaleLowerCase`, so highlighting
 * something the server did not match on would be a lie about why the row is here.
 *
 * The word set is what decides a part is a hit, not `RegExp.test` on the splitting
 * pattern: that pattern is global, so `test` advances its `lastIndex` and the next
 * part would be judged against the wrong position.
 */
function highlight(name: string, query: string) {
	const words = query
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	if (!words.length) return name;
	const lowered = new Set(words.map((word) => word.toLowerCase()));
	const parts = name.split(new RegExp(`(${words.join("|")})`, "gi"));
	return (
		<>
			{parts.map((part, index) =>
				lowered.has(part.toLowerCase()) ? (
					<mark key={index} className="rounded-sm bg-info-4 px-px font-semibold text-info-11">
						{part}
					</mark>
				) : (
					<span key={index}>{part}</span>
				),
			)}
		</>
	);
}

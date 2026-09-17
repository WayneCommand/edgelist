import type { ComponentType } from "react";
import { useT } from "../../hooks/useLocale";
import type { MessageKey } from "../../lib/i18n";
import { PAGE_SIZE_OPTIONS, parsePageSize, serializePageSize, type PageMode } from "../../lib/preferences";
import { pageCount, pageNumbers, pageRange } from "../../lib/pagination";
import { ChevronLeftIcon, ChevronRightIcon, type IconProps } from "../common/icons";
import { SegmentedControl } from "../common/SegmentedControl";

type PagerProps = {
	mode: PageMode;
	page: number;
	pageSize: number;
	/** How many entries the server says there are in total, not on this page. */
	total: number;
	/** A page change is in flight; the "load more" button reports this too. */
	loading: boolean;
	onPage: (page: number) => void;
	onPageSize: (size: number) => void;
	onMode: (mode: PageMode) => void;
	onLoadMore: () => void;
};

/**
 * The bar under a listing: how much is shown, how much to show at a time, and
 * how to reach the rest. It renders nothing for an empty directory, because the
 * "No files found" panel already says everything a pager could.
 */
export function Pager({ mode, page, pageSize, total, loading, onPage, onPageSize, onMode, onLoadMore }: PagerProps) {
	const t = useT();
	if (total <= 0) return null;
	const pages = pageCount(total, pageSize);
	const { from, to } = pageRange(page, pageSize, total);
	// With no page size there is only ever one page, and `to` is the total.
	const counted =
		mode === "load_more"
			? t("pager.showingOf", { to, total })
			: pages > 1
				? t("pager.rangeOf", { from, to, total })
				: t(total === 1 ? "pager.itemsOne" : "pager.itemsOther", { count: total });
	return (
		<div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
			<p className="text-muted">{counted}</p>
			<div className="flex flex-wrap items-center gap-2">
				<PageSizeSelect pageSize={pageSize} onChange={onPageSize} />
				<ModeSwitch mode={mode} onChange={onMode} />
				{mode === "load_more"
					? to < total && (
							<button
								type="button"
								disabled={loading}
								onClick={onLoadMore}
								className="tap rounded-control border border-border px-3 py-1 text-xs hover:bg-surface-secondary disabled:opacity-50"
							>
								{loading ? t("action.loading") : t("pager.showMore")}
							</button>
						)
					: pages > 1 && <PageButtons page={page} pages={pages} onPage={onPage} />}
			</div>
		</div>
	);
}

function PageSizeSelect({ pageSize, onChange }: { pageSize: number; onChange: (size: number) => void }) {
	const t = useT();
	return (
		<label className="flex items-center gap-1.5 text-xs text-muted">
			{t("pager.perPage")}
			<select
				value={serializePageSize(pageSize)}
				onChange={(event) => onChange(parsePageSize(event.target.value))}
				className="px-2 py-1 text-xs"
			>
				{PAGE_SIZE_OPTIONS.map((size) => (
					<option key={size} value={serializePageSize(size)}>
						{size > 0 ? size : t("pager.all")}
					</option>
				))}
			</select>
		</label>
	);
}

/**
 * The two ways more of a directory can arrive. "Pages" replaces the list, "Load
 * more" appends to it — the action button inside that mode says "Show more", so
 * the switch and the button never read the same.
 */
const MODES: ReadonlyArray<{ mode: PageMode; label: MessageKey }> = [
	{ mode: "pagination", label: "pager.pages" },
	{ mode: "load_more", label: "pager.loadMore" },
];

function ModeSwitch({ mode, onChange }: { mode: PageMode; onChange: (mode: PageMode) => void }) {
	const t = useT();
	return (
		<SegmentedControl
			ariaLabel={t("pager.pagingMode")}
			value={mode}
			onChange={onChange}
			options={MODES.map((option) => ({ value: option.mode, label: t(option.label) }))}
		/>
	);
}

function PageButtons({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
	const t = useT();
	return (
		<div className="flex items-center gap-0.5">
			<PageStep
				label={t("pager.previous")}
				disabled={page <= 1}
				onPress={() => onPage(page - 1)}
				icon={ChevronLeftIcon}
			/>
			{pageNumbers(page, pages).map((item, index) =>
				item === "gap" ? (
					// Keyed by position: the gaps themselves are not identifiable.
					<span key={`gap-${index}`} className="px-1 text-muted">
						…
					</span>
				) : (
					<button
						key={item}
						type="button"
						// `aria-current` is how a pager marks the active page.
						aria-current={item === page ? "page" : undefined}
						onClick={() => onPage(item)}
						className={`tap min-w-7 rounded-control px-2 py-1 text-xs ${
							item === page
								? "bg-accent text-accent-foreground"
								: "text-muted hover:bg-surface-secondary hover:text-foreground"
						}`}
					>
						{item}
					</button>
				),
			)}
			<PageStep
				label={t("pager.next")}
				disabled={page >= pages}
				onPress={() => onPage(page + 1)}
				icon={ChevronRightIcon}
			/>
		</div>
	);
}

function PageStep({
	label,
	disabled,
	onPress,
	icon: Icon,
}: {
	label: string;
	disabled: boolean;
	onPress: () => void;
	icon: ComponentType<IconProps>;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onPress}
			className="tap min-w-7 rounded-control px-2 py-1 text-xs text-muted hover:bg-surface-secondary hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
		>
			{/* A chevron is direction-bearing, so it mirrors with the writing direction. */}
			<Icon className="size-4 rtl:-scale-x-100" />
		</button>
	);
}

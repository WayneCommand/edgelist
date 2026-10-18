import { lazy, Suspense } from "react";
import { dismissNotice, resolveConfirm, useConfirmRequest, useNotices, type Notice } from "../lib/feedback";
import { Icon, type IconName } from "./Icon";

/**
 * Notifications and the confirmation dialog.
 *
 * The two are split deliberately. The notification stack is a box that is always mounted and
 * costs almost nothing; the dialog drags in the modal machinery — react-aria's overlay, focus
 * scope and presence — which is hundreds of kilobytes a visitor who never confirms anything
 * should not download. So `ConfirmHost` mounts the lazy dialog only once a request exists,
 * which is exactly when the chunk first becomes worth fetching.
 *
 * The trade is one chunk fetch on the first confirmation, and it happens while the dialog's own
 * backdrop is already fading in, from the same origin, on a connection that has just loaded the
 * app. What it buys is that the baseline no longer carries a modal for everyone.
 */
const ICON: Record<Notice["tone"], IconName> = {
	success: "check-circle",
	danger: "alert-circle",
	warning: "alert-triangle",
	info: "info",
};

const TONE: Record<Notice["tone"], string> = {
	success: "border-success-6 bg-success-3 text-success-12",
	danger: "border-danger-6 bg-danger-3 text-danger-12",
	warning: "border-warning-6 bg-warning-3 text-warning-12",
	info: "border-info-6 bg-info-3 text-info-12",
};

const GLYPH: Record<Notice["tone"], string> = {
	success: "text-success-9",
	danger: "text-danger-9",
	warning: "text-warning-9",
	info: "text-info-9",
};

/**
 * The notification stack (§1.4).
 *
 * Bottom-right, stacked upward, each a card in the semantic colour of its tone. `role="alert"`
 * on a failure and `role="status"` on everything else: a screen reader should interrupt for the
 * former and wait its turn for the latter.
 */
export function Toaster() {
	const notices = useNotices();
	return (
		<div
			aria-live="polite"
			className="pointer-events-none fixed right-4 bottom-4 z-notification flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
		>
			{notices.map((notice) => (
				<div
					key={notice.id}
					role={notice.tone === "danger" ? "alert" : "status"}
					className={`arrive pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-md ${TONE[notice.tone]}`}
				>
					<Icon name={ICON[notice.tone]} className={`mt-0.5 size-4 shrink-0 ${GLYPH[notice.tone]}`} strokeWidth={2} />
					<div className="min-w-0 flex-1">
						<p className="text-[13px] leading-snug font-medium break-words">{notice.message}</p>
						{notice.description && (
							<p className="mt-0.5 text-xs leading-snug opacity-80 break-words">{notice.description}</p>
						)}
					</div>
					<button
						type="button"
						onClick={() => dismissNotice(notice.id)}
						aria-label="Close"
						className="tap -mr-1 rounded-md p-0.5 opacity-60 hover:opacity-100"
					>
						<Icon name="close" className="size-3.5" strokeWidth={2} />
					</button>
				</div>
			))}
		</div>
	);
}

const ConfirmDialog = lazy(() => import("./ConfirmDialog").then((m) => ({ default: m.ConfirmDialog })));

/**
 * The one confirmation dialog.
 *
 * `lib/feedback.ts` holds at most one pending request, so two confirmations cannot stack —
 * which is the point. §7.4 and §12.4 use two different *visual* styles for a delete (a modal on
 * the file page, a popover in the admin tables) and both read this same request; the difference
 * is in how the caller asks, not in what the reader is told.
 */
export function ConfirmHost() {
	const request = useConfirmRequest();
	// Nothing is mounted until something is asked, which is what keeps the modal chunk out of
	// the first paint's module graph.
	if (!request) return null;
	return (
		<Suspense fallback={null}>
			<ConfirmDialog request={request} onResolve={resolveConfirm} />
		</Suspense>
	);
}

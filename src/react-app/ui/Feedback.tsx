import { useT } from "../hooks/useStore";
import { dismissNotice, resolveConfirm, useConfirmRequest, useNotices, type Notice } from "../lib/feedback";
import { Dialog, DialogActions } from "./Dialog";
import { Icon, type IconName } from "./Icon";

/**
 * The notification stack.
 *
 * Bottom-right and stacked upward, which is where §1.4 puts it and where it does
 * not cover the object card's own header. Each notice is a card in the semantic
 * colour of its tone: a green check, a red cross, an amber triangle, a blue i.
 *
 * `role="status"` on a success and `role="alert"` on a failure, because a screen
 * reader should interrupt for the latter and wait its turn for the former.
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

/**
 * The single confirmation dialog.
 *
 * One host for the whole app: `lib/feedback.ts` holds at most one pending request,
 * so two confirmations cannot stack — which is the point. §7.4 and §12.4 use two
 * different *visual* styles for a delete (a modal on the file page, a popover in
 * the admin tables), and both read this same request; the difference is only in
 * how the caller asks.
 */
export function ConfirmHost() {
	const request = useConfirmRequest();
	const t = useT();
	if (!request) return null;
	return (
		<Dialog
			title={request.title}
			size="sm"
			onClose={() => resolveConfirm(false)}
			footer={
				<DialogActions
					onCancel={() => resolveConfirm(false)}
					onConfirm={() => resolveConfirm(true)}
					cancelText={t("global.cancel")}
					confirmLabel={request.confirmLabel}
					confirmTone={request.danger ? "danger" : "soft"}
				/>
			}
		>
			<p className="leading-relaxed text-neutral-11">{request.message}</p>
		</Dialog>
	);
}

/**
 * Notifications and confirmations, as two small stores.
 *
 * Both are stores rather than context because they are called from `lib/` code as
 * often as from components — a failed upload reports itself from inside the upload
 * loop — and threading a context through those signatures would touch far more
 * code than the feature is worth. One `<Toaster />` and one `<ConfirmHost />` are
 * mounted at the root and subscribe.
 *
 * §1.4 fixes the visible duration at 3000 ms, so it is a constant here rather than
 * a parameter at each call site: a longer toast is a decision about the whole
 * interface, not about one message.
 */

import { useSyncExternalStore } from "react";

export type NoticeTone = "success" | "danger" | "warning" | "info";

export type Notice = {
	id: number;
	tone: NoticeTone;
	message: string;
	/** A second line, for the detail that would not fit in the title. */
	description?: string;
};

const DURATION_MS = 3000;

let nextId = 1;
let notices: Notice[] = [];
const noticeListeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emitNotices() {
	for (const listener of noticeListeners) listener();
}

export function dismissNotice(id: number) {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
	notices = notices.filter((notice) => notice.id !== id);
	emitNotices();
}

function push(tone: NoticeTone, message: string, description?: string): number {
	const id = nextId;
	nextId += 1;
	notices = [...notices, { id, tone, message, description }];
	// At most four at once: a stack taller than that covers the content it is
	// reporting on, and a burst of six errors is one problem seen six times.
	if (notices.length > 4) {
		const oldest = notices[0];
		dismissNotice(oldest.id);
	}
	emitNotices();
	timers.set(
		id,
		setTimeout(() => dismissNotice(id), DURATION_MS),
	);
	return id;
}

/**
 * Posts a notification.
 *
 * The call shapes are the ones the interface needs: a plain message, a success, a
 * failure, a warning. An `Error` is accepted directly so a `catch` block can hand
 * its reason over without unpacking it first.
 */
export const notify = {
	success: (message: string, description?: string) => push("success", message, description),
	error: (message: unknown, description?: string) =>
		push("danger", message instanceof Error ? message.message : String(message), description),
	warning: (message: string, description?: string) => push("warning", message, description),
	info: (message: string, description?: string) => push("info", message, description),
};

export function subscribeNotices(listener: () => void): () => void {
	noticeListeners.add(listener);
	return () => {
		noticeListeners.delete(listener);
	};
}

export function getNotices(): Notice[] {
	return notices;
}

/** The live notices, as React sees them. */
export function useNotices(): Notice[] {
	return useSyncExternalStore(subscribeNotices, getNotices, getNotices);
}

/* -------------------------------------------------------------- confirmations */

export type ConfirmRequest = {
	title: string;
	message: string;
	confirmLabel: string;
	/** Renders the confirming button in the danger tone. */
	danger?: boolean;
	resolve: (ok: boolean) => void;
};

let pending: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();

function emitConfirm() {
	for (const listener of confirmListeners) listener();
}

/**
 * Asks the user to confirm something, and resolves to their answer.
 *
 * A promise rather than a callback because every call site is a `try` block that
 * wants to stop when the answer is no — `if (!(await confirm(...))) return;` reads
 * as the guard it is.
 */
export function confirm(request: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
	return new Promise((resolve) => {
		// A second request while one is open answers the first with "no": two
		// dialogs stacked over each other is a worse outcome than losing a
		// confirmation the user did not see.
		pending?.resolve(false);
		pending = { ...request, resolve };
		emitConfirm();
	});
}

export function resolveConfirm(ok: boolean) {
	const request = pending;
	pending = null;
	emitConfirm();
	request?.resolve(ok);
}

export function subscribeConfirm(listener: () => void): () => void {
	confirmListeners.add(listener);
	return () => {
		confirmListeners.delete(listener);
	};
}

export function getConfirm(): ConfirmRequest | null {
	return pending;
}

/** The open confirmation, as React sees it. */
export function useConfirmRequest(): ConfirmRequest | null {
	return useSyncExternalStore(subscribeConfirm, getConfirm, getConfirm);
}

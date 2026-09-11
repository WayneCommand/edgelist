import { createContext, useContext } from "react";

export type ConfirmRequest = {
	title: string;
	message: string;
	confirmLabel?: string;
	/** Defaults to true; pass false for a non-destructive confirmation. */
	danger?: boolean;
};

export type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn>(async () => false);

/**
 * Replaces `window.confirm`. It resolves a promise instead of blocking the
 * thread, so callers keep reading like the old synchronous code.
 */
export function useConfirm(): ConfirmFn {
	return useContext(ConfirmContext);
}

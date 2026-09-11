import { useCallback } from "react";
import { toast } from "@heroui/react";

export type Notify = (message: string, error?: boolean) => void;

/**
 * HeroUI exposes an imperative toast API, so pages can surface feedback
 * without routing every message back up to the app shell.
 */
export function useNotify(): Notify {
	return useCallback((message, error) => {
		if (error) toast.danger(message);
		else toast.success(message);
	}, []);
}

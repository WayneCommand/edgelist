import { useCallback, useState } from "react";
import { readPreference, writePreference } from "../lib/preferences";

/**
 * `useState` whose value is mirrored into `localStorage`.
 *
 * The read happens during render rather than in an effect: React treats
 * "derive state from props" as a render-time concern, and reading in an effect
 * would paint the fallback for one frame first. When `key` changes — a
 * per-directory preference — the new key's value applies immediately, and the
 * stale override is simply ignored.
 */
export function useStoredState(key: string, fallback: string): [string, (next: string) => void] {
	const [override, setOverride] = useState<{ key: string; value: string } | null>(null);
	const value = override?.key === key ? override.value : readPreference(key, fallback);

	const setValue = useCallback(
		(next: string) => {
			writePreference(key, next);
			setOverride({ key, value: next });
		},
		[key],
	);

	return [value, setValue];
}

import { ApiError } from "./api";

/**
 * Retrying a request that failed.
 *
 * Two questions have to be answered before anything is sent twice: whether the
 * failure could plausibly go away, and whether repeating the request is safe.
 * The first is `isRetryable`; the second is the caller's, because it depends on
 * the endpoint — a chunk upload replaces its part by number, so repeating it
 * costs nothing but time, whereas an "open a session" call would leave the
 * first session behind.
 */

/**
 * Whether sending the same request again could plausibly succeed.
 *
 * A `fetch` that never reached the server rejects with a `TypeError` and leaves
 * no status to consult, so it counts as retryable — the next attempt may well
 * connect. Of the statuses, 429 and 5xx are the server asking for another try.
 * Everything else — 400, 401, 403, 404, 413 — is a decision about *this*
 * request, and repeating it would get the same answer while doing the work
 * twice.
 */
export function isRetryable(error: unknown): boolean {
	if (error instanceof TypeError) return true;
	if (!(error instanceof ApiError)) return false;
	return error.status === 429 || error.status >= 500;
}

/**
 * Waits between tries. The length is how many *retries* there are, so three
 * entries would mean four attempts; two keeps a chunk upload to three tries,
 * which covers a dropped connection without turning a genuinely broken
 * endpoint into a long wait.
 */
export const RETRY_DELAYS_MS: readonly number[] = [500, 1500];

export type RetryOptions = {
	/** Waits between tries, replacing `RETRY_DELAYS_MS`. */
	delays?: readonly number[];
	/** Injected so a test does not sit through the backoff. */
	sleep?: (ms: number) => Promise<void>;
	/** Called before each wait, for a readout that says a retry is happening. */
	onRetry?: (error: unknown, attempt: number) => void;
};

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `run`, trying again while it fails in a way that looks transient.
 *
 * The loop stops on the first failure that is not retryable, or when the waits
 * are used up, and rethrows that error — the caller sees the last failure, not
 * a summary, because that is the one that describes what is actually wrong.
 */
export async function withRetry<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const delays = options.delays ?? RETRY_DELAYS_MS;
	const sleep = options.sleep ?? wait;
	let attempt = 1;
	for (;;) {
		try {
			return await run();
		} catch (error) {
			// `undefined` covers both "not worth retrying" and "out of tries",
			// which lead to the same place.
			const delay = isRetryable(error) ? delays[attempt - 1] : undefined;
			if (delay === undefined) throw error;
			options.onRetry?.(error, attempt);
			await sleep(delay);
			attempt += 1;
		}
	}
}

import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { RETRY_DELAYS_MS, isRetryable, withRetry } from "./retry";

const instant = { sleep: async () => undefined };

describe("isRetryable", () => {
	it("retries a request that never reached the server", () => {
		// `fetch` rejects with a TypeError when the connection fails, which leaves
		// no status to consult — the next attempt may well connect.
		expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
	});

	it("retries the statuses that are asking for another attempt", () => {
		for (const status of [429, 500, 502, 503, 504]) {
			expect(isRetryable(new ApiError("busy", status)), `${status}`).toBe(true);
		}
	});

	it("does not retry a decision about this request", () => {
		// Repeating any of these would get the same answer while doing the work
		// twice — and a 413 would send the whole body again for nothing.
		for (const status of [400, 401, 403, 404, 413]) {
			expect(isRetryable(new ApiError("no", status)), `${status}`).toBe(false);
		}
	});

	it("does not retry a failure that is not a transport error", () => {
		// Our own refusals — a file past the ceiling, a plan that cannot be sent —
		// arrive as plain errors and would fail identically on a second try.
		expect(isRetryable(new Error("too big"))).toBe(false);
		expect(isRetryable("nope")).toBe(false);
		expect(isRetryable(undefined)).toBe(false);
	});
});

describe("withRetry", () => {
	it("returns the first successful result without waiting", async () => {
		let calls = 0;
		const result = await withRetry(async () => {
			calls += 1;
			return "ok";
		}, instant);
		expect(result).toBe("ok");
		expect(calls).toBe(1);
	});

	it("tries again after a transient failure and keeps the result", async () => {
		let calls = 0;
		const result = await withRetry(async () => {
			calls += 1;
			if (calls < 3) throw new ApiError("bad gateway", 502);
			return calls;
		}, instant);
		expect(result).toBe(3);
		expect(calls).toBe(3);
	});

	it("gives up immediately when the failure is not transient", async () => {
		let calls = 0;
		await expect(
			withRetry(async () => {
				calls += 1;
				throw new ApiError("forbidden", 403);
			}, instant),
		).rejects.toThrow("forbidden");
		expect(calls).toBe(1);
	});

	it("rethrows the last failure once the waits are used up", async () => {
		let calls = 0;
		await expect(
			withRetry(async () => {
				calls += 1;
				throw new ApiError(`attempt ${calls}`, 503);
			}, instant),
		).rejects.toThrow("attempt 3");
		// One attempt, plus one per wait in the default policy.
		expect(calls).toBe(RETRY_DELAYS_MS.length + 1);
	});

	it("waits the configured backoff between tries", async () => {
		const waits: number[] = [];
		await expect(
			withRetry(
				async () => {
					throw new ApiError("still failing", 500);
				},
				{
					delays: [10, 20],
					sleep: async (ms) => {
						waits.push(ms);
					},
				},
			),
		).rejects.toThrow("still failing");
		expect(waits).toEqual([10, 20]);
	});

	it("reports each retry so a caller can say one is happening", async () => {
		const seen: Array<[string, number]> = [];
		await expect(
			withRetry(
				async () => {
					throw new ApiError("flaky", 503);
				},
				{
					delays: [0],
					sleep: async () => undefined,
					onRetry: (error, attempt) => seen.push([(error as Error).message, attempt]),
				},
			),
		).rejects.toThrow("flaky");
		expect(seen).toEqual([["flaky", 1]]);
	});
});

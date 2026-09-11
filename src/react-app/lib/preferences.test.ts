import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIEW_MODE, VIEW_MODE_KEY, parseViewMode, readPreference, writePreference } from "./preferences";

/** Minimal in-memory `localStorage`, since the suite runs in a Node environment. */
function fakeStorage() {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => void entries.set(key, value),
		removeItem: (key: string) => void entries.delete(key),
		clear: () => entries.clear(),
		key: (index: number) => [...entries.keys()][index] ?? null,
		get length() {
			return entries.size;
		},
	};
}

describe("preferences", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", fakeStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("round-trips a value under the app prefix", () => {
		writePreference("view-mode", "grid");
		expect(readPreference("view-mode", "list")).toBe("grid");
		expect(globalThis.localStorage.getItem("edgelist:view-mode")).toBe("grid");
	});

	it("falls back when the key was never written", () => {
		expect(readPreference("missing", "list")).toBe("list");
	});

	it("survives storage being unavailable", () => {
		vi.stubGlobal("localStorage", undefined);
		expect(readPreference(VIEW_MODE_KEY, "list")).toBe("list");
		expect(() => writePreference(VIEW_MODE_KEY, "grid")).not.toThrow();
	});

	it("ignores values written by an older build", () => {
		expect(parseViewMode("grid")).toBe("grid");
		expect(parseViewMode("list")).toBe("list");
		// OpenList also has an `image` layout, which this build does not render yet.
		expect(parseViewMode("image")).toBe(DEFAULT_VIEW_MODE);
		expect(parseViewMode("")).toBe(DEFAULT_VIEW_MODE);
	});
});

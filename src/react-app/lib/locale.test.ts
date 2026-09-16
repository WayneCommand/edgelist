import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The store resolves its starting language at import time — stored choice,
 * then the browser, then English — so every case here builds a fresh copy of
 * the module against the globals it wants. `vi.resetModules()` is what makes
 * that possible; without it the first import would decide for the whole file.
 */

/** Minimal in-memory `localStorage`, since the suite runs in a Node environment. */
function fakeStorage(initial: Record<string, string> = {}) {
	const entries = new Map(Object.entries(initial));
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

/** The store, re-imported against a stored preference and a browser language. */
async function freshStore(stored?: string, browser?: string) {
	vi.resetModules();
	vi.stubGlobal("localStorage", fakeStorage(stored === undefined ? {} : { "edgelist:locale": stored }));
	vi.stubGlobal("navigator", { language: browser });
	return import("./locale");
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("the starting language", () => {
	it("takes an explicit choice over the browser's", async () => {
		const store = await freshStore("zh", "en-US");
		expect(store.getLocale()).toBe("zh");
	});

	it("follows the browser when nothing was ever chosen", async () => {
		const store = await freshStore(undefined, "zh-CN");
		expect(store.getLocale()).toBe("zh");
	});

	it("answers English when the browser reports nothing", async () => {
		const store = await freshStore();
		expect(store.getLocale()).toBe(store.DEFAULT_LOCALE);
	});

	it("ignores a stored value that is not one of ours", async () => {
		// A hand-edited key or a value from an older build must not lock the app
		// out of both languages; the browser decides instead.
		const store = await freshStore("de", "zh-CN");
		expect(store.getLocale()).toBe("zh");
	});
});

describe("setLocale", () => {
	it("remembers the choice and tells the subscribers", async () => {
		const store = await freshStore(undefined, "en-US");
		const seen: string[] = [];
		store.subscribe(() => seen.push(store.getLocale()));

		store.setLocale("zh");

		expect(store.getLocale()).toBe("zh");
		expect(globalThis.localStorage.getItem("edgelist:locale")).toBe("zh");
		expect(seen).toEqual(["zh"]);
	});

	it("says nothing when the language has not changed", async () => {
		const store = await freshStore(undefined, "en-US");
		let calls = 0;
		store.subscribe(() => {
			calls += 1;
		});

		store.setLocale("en");

		expect(calls).toBe(0);
	});

	it("stops calling a listener that unsubscribed", async () => {
		const store = await freshStore(undefined, "en-US");
		let calls = 0;
		const off = store.subscribe(() => {
			calls += 1;
		});

		off();
		store.setLocale("zh");

		expect(calls).toBe(0);
	});
});

describe("the document language", () => {
	/**
	 * `lib/locale.ts` writes `lang` onto `<html>` at import and on every change.
	 * The stub has to be in place *before* the import, because the first write
	 * happens as the module is evaluated.
	 */
	it("marks the starting language on the document", async () => {
		const root = { lang: "" };
		vi.stubGlobal("document", { documentElement: root });
		const store = await freshStore("zh", "en-US");
		expect(root.lang).toBe("zh");
		expect(store.getLocale()).toBe("zh");
	});

	it("follows the language as it changes", async () => {
		// A page marked `lang="en"` around Chinese text is mispronounced, and the
		// attribute is what the browser reads for line breaking and font fallback.
		const root = { lang: "" };
		vi.stubGlobal("document", { documentElement: root });
		const store = await freshStore(undefined, "en-US");

		store.setLocale("zh");

		expect(root.lang).toBe("zh");
	});

	it("is content to have no document at all", async () => {
		// The Node test environment has none, and neither does any other importer
		// that is not a browser.
		const store = await freshStore(undefined, "en-US");
		expect(() => store.setLocale("zh")).not.toThrow();
	});
});

describe("the module translator", () => {
	it("follows the language in effect", async () => {
		const store = await freshStore(undefined, "en-US");
		expect(store.t("nav.files")).toBe("Files");
		store.setLocale("zh");
		expect(store.t("nav.files")).toBe("文件");
	});

	it("picks the singular and the plural form", async () => {
		const store = await freshStore(undefined, "en-US");
		expect(store.tCount(1, "pager.itemsOne", "pager.itemsOther")).toBe("1 item");
		expect(store.tCount(2, "pager.itemsOne", "pager.itemsOther")).toBe("2 items");
	});

	it("reads the same form twice in a language that does not inflect", async () => {
		// Chinese marks no plural, so both entries hold the same sentence — which
		// is exactly why the choice is two keys rather than a plural engine.
		const store = await freshStore("zh", "zh-CN");
		expect(store.tCount(1, "pager.itemsOne", "pager.itemsOther")).toBe("1 个项目");
		expect(store.tCount(2, "pager.itemsOne", "pager.itemsOther")).toBe("2 个项目");
	});
});

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, EN, LOCALES, ZH, interpolate, isLocale, localeFrom, translate } from "./i18n";
import type { MessageKey } from "./i18n";

const KEYS = Object.keys(EN) as MessageKey[];

/** `src/react-app`, whatever the tests are run from. */
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...sourceFiles(full));
		else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
	}
	return found;
}

/** Every non-test source file, as `path -> contents`, keyed relative to the app. */
function sources(): Map<string, string> {
	return new Map(sourceFiles(APP_ROOT).map((file) => [relative(APP_ROOT, file), readFileSync(file, "utf8")]));
}

/** Every `{{name}}` a template asks for, sorted so two templates compare equal. */
function placeholders(template: string): string[] {
	return [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
}

describe("translate", () => {
	it("reads the chosen language", () => {
		expect(translate("en", "nav.files")).toBe("Files");
		expect(translate("zh", "nav.files")).toBe("文件");
	});

	it("interpolates the parameters it is given", () => {
		expect(translate("en", "files.searchTitle", { query: "notes" })).toBe("Search: notes");
		expect(translate("zh", "files.searchTitle", { query: "笔记" })).toBe("搜索：笔记");
	});

	it("leaves a placeholder standing when no parameter matches it", () => {
		// A visible `{{count}}` is a bug report; a silently blank string is not.
		expect(translate("en", "files.searchTitle")).toBe("Search: {{query}}");
	});

	it("falls back to English rather than leaking the key", () => {
		// Every shipped key is translated — the parity test below sees to that —
		// so this deletes one to reach the path a half-finished catalogue takes.
		// The fallback is the safety net, not the plan: it exists so that adding a
		// key to `EN` and forgetting `ZH` shows English instead of `files.heading`.
		const saved = ZH["files.heading"];
		try {
			delete ZH["files.heading"];
			expect(translate("zh", "files.heading")).toBe(EN["files.heading"]);
		} finally {
			ZH["files.heading"] = saved;
		}
	});

	it("never returns an empty string", () => {
		for (const locale of LOCALES) {
			for (const key of KEYS) expect(translate(locale, key)).toBeTruthy();
		}
	});
});

describe("interpolate", () => {
	it("substitutes every occurrence", () => {
		expect(interpolate("{{a}} and {{a}}", { a: "x" })).toBe("x and x");
	});

	it("accepts a number without stringifying the caller's job", () => {
		expect(interpolate("{{count}} items", { count: 3 })).toBe("3 items");
	});

	it("ignores a placeholder whose parameter is absent", () => {
		expect(interpolate("{{a}}/{{b}}", { a: 1 })).toBe("1/{{b}}");
	});
});

describe("isLocale", () => {
	it("accepts the languages the app ships", () => {
		for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
	});

	it("rejects anything else, including the empty string", () => {
		// `""` is what `readPreference` answers when nothing was ever stored, and
		// "not chosen" has to stay distinguishable from "chosen as English".
		expect(isLocale("")).toBe(false);
		expect(isLocale("fr")).toBe(false);
		expect(isLocale("en-US")).toBe(false);
		expect(isLocale(undefined)).toBe(false);
		expect(isLocale(null)).toBe(false);
		expect(isLocale(42)).toBe(false);
	});
});

describe("localeFrom", () => {
	it("reads only the primary subtag", () => {
		// Browsers report full tags; the region and script are not distinctions
		// this app makes.
		expect(localeFrom("zh-CN")).toBe("zh");
		expect(localeFrom("zh-Hant-TW")).toBe("zh");
		expect(localeFrom("en-GB")).toBe("en");
	});

	it("is case-insensitive", () => {
		expect(localeFrom("ZH")).toBe("zh");
	});

	it("answers English for anything it does not recognise", () => {
		expect(localeFrom("fr-FR")).toBe("en");
		expect(localeFrom("")).toBe(DEFAULT_LOCALE);
		expect(localeFrom(undefined)).toBe(DEFAULT_LOCALE);
		expect(localeFrom(null)).toBe(DEFAULT_LOCALE);
	});
});

/**
 * The dictionaries have to stay in step by hand, so these are the checks that
 * make forgetting a key a failing test rather than a stray English string in a
 * translated interface.
 */
describe("catalogue parity", () => {
	it("translates every English key", () => {
		expect(KEYS.filter((key) => !(key in ZH))).toEqual([]);
	});

	it("holds no key the English table does not declare", () => {
		// A typo in a `ZH` key would otherwise sit there forever, never read.
		expect(Object.keys(ZH).filter((key) => !(key in EN))).toEqual([]);
	});

	it("asks for the same placeholders in both languages", () => {
		// A translation that drops `{{count}}` renders a sentence with a hole in
		// it, and one that invents a placeholder renders the braces.
		for (const key of KEYS) {
			expect({ key, placeholders: placeholders(ZH[key] ?? "") }).toEqual({
				key,
				placeholders: placeholders(EN[key]),
			});
		}
	});

	it("keeps the English table complete on its own", () => {
		// `EN` is the fallback target, so a blank entry there has nowhere to fall.
		for (const key of KEYS) expect(EN[key].trim()).not.toBe("");
	});
});

/**
 * The catalogue is only a single source of truth if nothing bypasses it.
 *
 * A hardcoded string is invisible to every other check here: it compiles, it
 * renders, and it is simply wrong in one of the two languages. `StoragesPage`
 * carried a Chinese "mount path must be unique" on an otherwise English page
 * for exactly that reason, and the only reason it surfaced is that somebody read
 * the page. Reading the source is crude, but it is the only check that sees a
 * literal.
 */
describe("nothing bypasses the catalogue", () => {
	/** The catalogue itself, and the language names, which are never translated. */
	const EXEMPT = ["lib/i18n.ts", "components/common/LocaleSelect.tsx"];

	it("keeps Chinese out of every other frontend file", () => {
		const offenders: string[] = [];
		for (const [file, contents] of sources()) {
			if (EXEMPT.includes(file)) continue;
			contents.split("\n").forEach((line, index) => {
				// A comment is documentation, not interface text.
				const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
				if (/[\u4e00-\u9fff]/.test(code)) offenders.push(`${file}:${index + 1}`);
			});
		}
		expect(offenders).toEqual([]);
	});

	it("uses every key it declares", () => {
		// A key nothing reads is a leftover from a rewrite, and it keeps a
		// translation alive for a string that is no longer on screen.
		const all = [...sources().values()].join("\n");
		expect(KEYS.filter((key) => !all.includes(`"${key}"`))).toEqual([]);
	});
});

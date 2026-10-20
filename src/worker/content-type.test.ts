import { describe, expect, it } from "vitest";
import { contentTypeFor, isViewableType } from "./content-type";

/**
 * The type a direct link answers with.
 *
 * An object store commonly stores everything as `application/octet-stream`, and a
 * link carrying that type is a download in every client — an `<img>` shows a
 * broken icon, a `<video>` refuses to play, and a third-party app cannot tell an
 * image from an archive. These cases pin the fallback: the extension decides when
 * the store is silent.
 */

describe("contentTypeFor", () => {
	it("names the common image types", () => {
		expect(contentTypeFor("photo.png")).toBe("image/png");
		expect(contentTypeFor("photo.JPG")).toBe("image/jpeg");
		expect(contentTypeFor("diagram.svg")).toBe("image/svg+xml");
	});

	it("names video and audio, which is what a player needs to try", () => {
		expect(contentTypeFor("clip.mp4")).toBe("video/mp4");
		expect(contentTypeFor("song.mp3")).toBe("audio/mpeg");
	});

	it("gives text a charset, or a non-English file renders as mojibake", () => {
		expect(contentTypeFor("readme.md")).toBe("text/markdown; charset=utf-8");
		expect(contentTypeFor("notes.txt")).toBe("text/plain; charset=utf-8");
	});

	it("treats source code as text rather than an anonymous binary", () => {
		expect(contentTypeFor("app.js")).toMatch(/^text\//);
		expect(contentTypeFor("main.py")).toMatch(/^text\//);
		expect(contentTypeFor("config.yaml")).toMatch(/^text\//);
	});

	it("falls back to a binary type for an unknown extension", () => {
		expect(contentTypeFor("archive.xyz")).toBe("application/octet-stream");
	});

	it("falls back for a name with no extension at all", () => {
		expect(contentTypeFor("Makefile")).toBe("application/octet-stream");
	});
});

describe("isViewableType", () => {
	it("lets a browser show images, media and text", () => {
		expect(isViewableType("image/png")).toBe(true);
		expect(isViewableType("video/mp4")).toBe(true);
		expect(isViewableType("text/plain; charset=utf-8")).toBe(true);
		expect(isViewableType("application/pdf")).toBe(true);
	});

	it("never renders HTML inline", () => {
		// A shared page served inline would run its scripts on this origin; the
		// share owner asked to publish a file, not to host an executable page.
		expect(isViewableType("text/html; charset=utf-8")).toBe(false);
		expect(isViewableType("application/octet-stream")).toBe(false);
		expect(isViewableType("application/zip")).toBe(false);
	});
});

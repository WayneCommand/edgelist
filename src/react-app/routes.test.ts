import { describe, expect, it } from "vitest";
import { isDownloadPath, loginRedirect, ROUTES } from "./routes";

describe("sign-in redirects", () => {
	it("returns to the path that was refused", () => {
		expect(loginRedirect("?redirect=%2Fwaynecos%2Fdocs")).toBe("/waynecos/docs");
		expect(loginRedirect("?redirect=%2F%40manage%2Fstorages")).toBe("/@manage/storages");
	});

	it("keeps a download link, so signing in can finish the download", () => {
		expect(loginRedirect("?redirect=%2Fd%2Fwaynecos%2Fdocs%2Fnotes.md")).toBe("/d/waynecos/docs/notes.md");
		expect(isDownloadPath("/d/waynecos/notes.md")).toBe(true);
		// The bare prefix is a route, but not a file; the app must not treat it
		// as a document navigation.
		expect(isDownloadPath("/d/")).toBe(false);
		expect(isDownloadPath("/waynecos/notes.md")).toBe(false);
	});

	it("falls back to the file browser when there is no destination", () => {
		expect(loginRedirect("")).toBe(ROUTES.files());
		expect(loginRedirect("?redirect=")).toBe(ROUTES.files());
	});

	it("refuses destinations that would leave the app", () => {
		// `//host` is protocol-relative, and browsers normalise a backslash after
		// the first slash into another slash. Both are open redirects, so neither
		// may survive sign-in.
		expect(loginRedirect("?redirect=%2F%2Fevil.example")).toBe(ROUTES.files());
		expect(loginRedirect("?redirect=%2F%5Cevil.example")).toBe(ROUTES.files());
		expect(loginRedirect("?redirect=https%3A%2F%2Fevil.example")).toBe(ROUTES.files());
		expect(loginRedirect("?redirect=%E0%A4%A")).toBe(ROUTES.files());
	});
});

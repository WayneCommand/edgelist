import { describe, expect, it } from "vitest";
import wrangler from "../../wrangler.json";
import app from "./index";

/**
 * The Worker's own paths have to be routed to it *before* the asset handler.
 *
 * `not_found_handling: "single-page-application"` is what lets a browser open
 * `/@manage/storages` directly: an unknown path falls through to `index.html`
 * and React Router takes over. The same rule swallows `/d/...` — a route the
 * Worker answers with bytes — unless the path is listed in `run_worker_first`.
 * When it is not, a preview or a download gets the HTML shell with a 200,
 * which is exactly the failure this file pins: no error, no missing file, just
 * the sign-in page where a file should be.
 *
 * The check is by top-level prefix rather than by exact path so it keeps
 * working as routes are added under one: `/d/*` covers every file, and the
 * share-download rule covers every share because both have the same first
 * segment. A new top-level Worker route fails this test until the asset config
 * learns about it.
 */

function topLevel(path: string): string {
	return path.split("/")[1] ?? "";
}

describe("asset routing", () => {
	it("sends every top-level Worker route to the Worker before the SPA fallback", () => {
		const routed = new Set(wrangler.assets.run_worker_first.map(topLevel));
		const missing = [...new Set(app.routes.map((route) => topLevel(route.path)))].filter(
			(prefix) => prefix !== "" && !routed.has(prefix),
		);

		expect(missing, "these paths would be answered with index.html instead of reaching the Worker").toEqual([]);
	});

	it("keeps the SPA fallback for client-side routes", () => {
		// The guard above is only meaningful if unknown paths still render the
		// app; turning the fallback off would fix `/d/*` by breaking every
		// client-side route instead.
		expect(wrangler.assets.not_found_handling).toBe("single-page-application");
	});
});

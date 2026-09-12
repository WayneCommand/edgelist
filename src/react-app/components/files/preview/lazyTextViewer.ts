import { lazy } from "react";

/**
 * Monaco is by far the largest dependency in the app: importing it eagerly put
 * roughly 8 MB on every visit, including the ones that only ever show a file
 * list. Both the text preview and the Markdown viewer's source mode go through
 * this single lazy binding, so the editor is fetched once, the first time a file
 * is actually opened in it.
 */
export const LazyTextViewer = lazy(() => import("./TextViewer").then((module) => ({ default: module.TextViewer })));

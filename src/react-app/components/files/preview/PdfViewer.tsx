import { useT } from "../../../hooks/useLocale";

/**
 * The browser's own PDF viewer, fed an object URL. That is the whole feature:
 * rendering PDFs in JavaScript would mean shipping a WASM build of pdfium,
 * which is a bigger download than everything else in this app put together.
 *
 * The object URL carries the response's `Content-Type`, so `application/pdf`
 * gets the built-in viewer. A driver that answers `application/octet-stream`
 * would instead make the iframe download the file — `withMime` is what stops
 * that, and it is why the blob is retyped before the URL is built.
 */
export function PdfViewer({ title, url }: { title: string; url: string }) {
	const t = useT();
	return (
		<div className="space-y-2">
			<iframe
				src={url}
				title={title}
				className="h-[min(68vh,640px)] min-h-[360px] w-full rounded-lg border border-border bg-surface-secondary"
			/>
			<p className="text-xs text-muted">{t("preview.pdfNote")}</p>
		</div>
	);
}

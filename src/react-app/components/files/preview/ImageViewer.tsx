import type { FileItem } from "../../../lib/types";

/**
 * The bytes arrive as an object URL built from an authenticated fetch — `/d/*`
 * needs an `Authorization` header, which an `<img src>` cannot send.
 */
export function ImageViewer({ item, url }: { item: FileItem; url: string }) {
	return (
		<div className="flex max-h-[min(68vh,640px)] min-h-[240px] items-center justify-center overflow-auto rounded-lg border border-border bg-surface-secondary p-4">
			<img src={url} alt={item.name} className="max-h-full max-w-full object-contain" />
		</div>
	);
}

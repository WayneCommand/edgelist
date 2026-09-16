import type { FileItem } from "../../../lib/types";
import { FRAME, PAD, PANEL, WELL } from "./metrics";

/**
 * The bytes arrive as an object URL built from an authenticated fetch — `/d/*`
 * needs an `Authorization` header, which an `<img src>` cannot send.
 */
export function ImageViewer({ item, url }: { item: FileItem; url: string }) {
	return (
		<div className={`flex ${PANEL} items-center justify-center overflow-auto ${FRAME} ${WELL} ${PAD}`}>
			{/* `image-outline` keeps a white screenshot from dissolving into the frame
			    behind it. It is a 1px ring drawn just inside the edge, so it never
			    changes the image's size. */}
			<img src={url} alt={item.name} className="image-outline max-h-full max-w-full object-contain" />
		</div>
	);
}

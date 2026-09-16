import { useT } from "../../../hooks/useLocale";
import { previewNotice, type PreviewKind } from "../../../lib/preview";
import type { FileItem } from "../../../lib/types";
import { FRAME, PAD, WELL } from "./metrics";

/**
 * What a file gets when no previewer can show it: an Office document, or one too
 * large to hold in memory. Saying which — and why — beats a spinner that never
 * resolves, or a panel that explains nothing.
 *
 * It keeps the frame but not the panel height: this is a sentence, and a
 * sentence does not need 640 pixels.
 */
export function UnsupportedViewer({ item, kind }: { item: FileItem; kind: PreviewKind }) {
	const t = useT();
	const notice = previewNotice(kind, item.name, t);
	return (
		<div className={`${FRAME} ${WELL} ${PAD} text-sm`}>
			<p className="font-medium">{notice.title}</p>
			<p className="mt-2 text-muted">{notice.body}</p>
		</div>
	);
}

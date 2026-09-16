import { InboxIcon } from "./icons";

/**
 * The one way this app says "there is nothing here".
 *
 * It is a component because the three lists that can be empty had three
 * different treatments: the file list centred a bare line with 64px of padding,
 * the other two left-aligned theirs with 32px. An empty list is a moment the
 * user is looking for something that is not there, so it should read as a
 * deliberately drawn state rather than as a row that failed to render.
 *
 * The icon sits in a neutral disc rather than being tinted: it is decoration,
 * and the message is the thing to read.
 */
export function EmptyState({ message }: { message: string }) {
	return (
		<div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
			<span className="flex size-12 items-center justify-center rounded-full bg-surface-secondary text-muted">
				<InboxIcon className="size-6" />
			</span>
			<p className="text-sm text-muted">{message}</p>
		</div>
	);
}

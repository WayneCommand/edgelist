import { type DragEvent as ReactDragEvent, type ReactNode, useEffect, useState } from "react";
import { useT } from "../../hooks/useLocale";
import { droppedTree, type DroppedTree } from "../../lib/dropUpload";

type DropZoneProps = {
	onDrop: (tree: DroppedTree) => void;
	disabled?: boolean;
	children: ReactNode;
};

/** A drag only counts when it carries files; dragging text must be left alone. */
function carriesFiles(event: { dataTransfer: DataTransfer | null }): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function DropZone({ onDrop, disabled = false, children }: DropZoneProps) {
	const t = useT();
	// `dragenter` and `dragleave` fire again for every element the pointer
	// crosses, so the overlay is driven by a counter: a boolean would flicker off
	// the moment the drag moved over a row inside this container.
	const [depth, setDepth] = useState(0);
	// Crossing the page raises and lowers this several times in a drag, so the
	// overlay gets the most restrained transition there is: a plain fade, no
	// travel. It is also the place a hard cut was most visible, because it
	// happens under the pointer that is causing it.
	const active = depth > 0 && !disabled;

	useEffect(() => {
		if (disabled) return;
		// Without this, a drop that misses the zone makes the browser navigate to
		// the dropped file and throws away the page the user was working in.
		function block(event: DragEvent) {
			if (carriesFiles(event)) event.preventDefault();
		}
		window.addEventListener("dragover", block);
		window.addEventListener("drop", block);
		return () => {
			window.removeEventListener("dragover", block);
			window.removeEventListener("drop", block);
		};
	}, [disabled]);

	function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
		if (disabled || !carriesFiles(event)) return;
		event.preventDefault();
		setDepth((count) => count + 1);
	}

	function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
		if (disabled || !carriesFiles(event)) return;
		// A drop event only fires on an element that cancelled the drag over it.
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}

	async function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
		if (disabled || !carriesFiles(event)) return;
		event.preventDefault();
		setDepth(0);
		onDrop(await droppedTree(event.dataTransfer));
	}

	return (
		<div
			className="relative"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={() => setDepth((count) => Math.max(0, count - 1))}
			onDrop={(event) => void handleDrop(event)}
		>
			{children}
			{/* Kept mounted so the fade has somewhere to come from.
			    `pointer-events-none` keeps the overlay out of hit testing, so it
			    cannot produce the `dragleave` that would immediately hide it.
			    `aria-hidden` is not redundant with the fade: opacity alone does not
			    take the hint out of the reading order, so a screen reader would
			    announce an upload prompt while no drag is happening. */}
			<div
				aria-hidden={!active}
				data-open={active}
				className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80 transition-opacity duration-150 ease-out motion-reduce:transition-none ${
					active ? "opacity-100" : "opacity-0"
				}`}
			>
				<p className="text-sm font-medium text-accent">{t("toolbar.dropHint")}</p>
			</div>
		</div>
	);
}

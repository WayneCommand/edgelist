import { useCallback, useEffect, useRef, useState } from "react";
import type { FileObject } from "../../lib/types";
import { formatDate, formatSize, withMime } from "../../lib/format";
import { useT } from "../../hooks/useStore";
import { IconButton } from "../../ui/ActionButton";
import { Loading, StateMessage } from "../../ui/Field";
import { readFile } from "../../lib/api";
import { currentViewportZoom } from "../../lib/viewport-zoom-dom";

/**
 * The image viewer (§5.3).
 *
 * The stage is the whole component: the toolbar is thin, and everything below it is
 * a picture you can zoom, pan, rotate and step through. §5.3 specifies the
 * behaviour precisely, and three parts of it are worth calling out because they are
 * what makes it feel like an image viewer rather than a centred `<img>`:
 *
 * **Zoom is anchored at the pointer.** A wheel step scales by 1.08 and then corrects
 * the translation so the pixel under the cursor stays put. Zooming about the centre
 * instead makes a picture drift away from whatever you were looking at.
 *
 * **The scale and the fit mode are separate.** `contain`, `height` and `width` set
 * the *base* size of the image; the scale multiplies it. Resetting therefore means
 * scale 1 and offset 0, not "pick a new fit" — which is what §5.3's `f`-less reset
 * does (`0`, `c`, `h`, `w` each set their own mode).
 *
 * **Panning only engages above scale 1.** Below that the whole picture is already
 * visible, so a drag has nothing to reveal and the cursor stays a default arrow.
 */
type Fit = "contain" | "height" | "width";

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const STEP = 0.25;

export function ImageViewer({
	items,
	startIndex,
	onClose,
}: {
	/** Every picture in the directory, in listing order (§5.3). */
	items: FileObject[];
	startIndex: number;
	onClose: () => void;
}) {
	const t = useT();
	const [index, setIndex] = useState(startIndex);
	const item = items[index];

	// Keyed by the path it belongs to: a viewer handed a new file reads the mismatch and
	// shows its spinner, so nothing is written before the fetch starts.
	const [bytes, setBytes] = useState<{ for: string; src: string | null; failed: boolean } | null>(null);
	const [scale, setScale] = useState(1);
	const [tx, setTx] = useState(0);
	const [ty, setTy] = useState(0);
	const [rotation, setRotation] = useState(0);
	const [fit, setFit] = useState<Fit>("contain");
	const [showInfo, setShowInfo] = useState(false);
	const [dragging, setDragging] = useState(false);
	const stage = useRef<HTMLDivElement>(null);
	const dragOrigin = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

	// The bytes, once per file, revoked when it or the component goes away.
	useEffect(() => {
		if (!item) return;
		let cancelled = false;
		let created: string | null = null;
		(async () => {
			try {
				const response = await readFile(item.path);
				const blob = withMime(await response.blob(), item.name);
				if (cancelled) return;
				created = URL.createObjectURL(blob);
				setBytes({ for: item.path, src: created, failed: false });
			} catch {
				if (!cancelled) setBytes({ for: item.path, src: null, failed: true });
			}
		})();
		return () => {
			cancelled = true;
			if (created) URL.revokeObjectURL(created);
		};
	}, [item]);

	const reset = useCallback(() => {
		setScale(1);
		setTx(0);
		setTy(0);
		setRotation(0);
	}, []);

	const setFitMode = useCallback(
		(mode: Fit) => {
			setFit(mode);
			reset();
		},
		[reset],
	);

	const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
		setScale((current) => {
			const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor));
			const ratio = next / current;
			if (anchor && ratio !== 1) {
				// Keep the point under the cursor still: the offset has to grow by
				// the same factor, measured from the anchor.
				setTx((value) => anchor.x - (anchor.x - value) * ratio);
				setTy((value) => anchor.y - (anchor.y - value) * ratio);
			}
			return next;
		});
	}, []);

	const previous = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);
	const next = useCallback(() => setIndex((value) => Math.min(items.length - 1, value + 1)), [items.length]);

	// §5.3's keyboard map. Bound to the window for as long as the viewer is
	// mounted, which is what lets the arrow keys work without the stage holding
	// focus — and `f` is deliberately absent (§18.14).
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
			switch (event.key) {
				case "ArrowLeft":
					previous();
					break;
				case "ArrowRight":
					next();
					break;
				case "+":
				case "=":
					zoomBy(1 / (1 - STEP));
					break;
				case "-":
					zoomBy(1 - STEP);
					break;
				case "r":
					setRotation((value) => value - 90);
					break;
				case "R":
					setRotation((value) => value + 90);
					break;
				case "0":
					reset();
					break;
				case "i":
					setShowInfo((value) => !value);
					break;
				case "c":
					setFitMode("contain");
					break;
				case "h":
					setFitMode("height");
					break;
				case "w":
					setFitMode("width");
					break;
				case "Escape":
					if (document.fullscreenElement) return;
					onClose();
					break;
				default:
					break;
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [next, onClose, previous, reset, setFitMode, zoomBy]);

	if (!item) return null;

	const current = bytes?.for === item.path ? bytes : null;
	const src = current?.src ?? null;
	const failed = current?.failed ?? false;

	const baseClass =
		fit === "contain"
			? "max-h-full max-w-full object-contain"
			: fit === "height"
				? "h-full w-auto max-w-none"
				: "w-full max-h-none object-contain";

	return (
		<div
			className="flex w-full flex-col overflow-hidden rounded-xl bg-neutral-2"
			style={{ height: "calc(var(--app-vh) * 0.7)" }}
		>
			<div className="flex items-center gap-1.5 bg-neutral-1 px-2 py-1.5">
				{index > 0 && <IconButton icon="chevron-left" label={t("preview.previous")} size="sm" onPress={previous} />}
				<span className="hidden max-w-[280px] truncate text-xs text-neutral-11 sm:block">{item.name}</span>
				{items.length > 1 && (
					<span className="numeric text-[11px] text-neutral-10">
						{index + 1}/{items.length}
					</span>
				)}
				<div className="ml-auto flex items-center gap-0.5">
					<IconButton
						icon="info"
						label={t("preview.info")}
						size="sm"
						active={showInfo}
						onPress={() => setShowInfo((v) => !v)}
					/>
					<IconButton icon="zoom-out" label={t("preview.zoom_out")} size="sm" onPress={() => zoomBy(1 - STEP)} />
					<IconButton icon="zoom-in" label={t("preview.zoom_in")} size="sm" onPress={() => zoomBy(1 / (1 - STEP))} />
					<IconButton
						icon="minimize"
						label={t("preview.fit_page")}
						size="sm"
						active={fit === "contain"}
						onPress={() => setFitMode("contain")}
					/>
					<IconButton
						icon="expand-all"
						label={t("preview.fit_height")}
						size="sm"
						active={fit === "height"}
						onPress={() => setFitMode("height")}
					/>
					<IconButton
						icon="layers"
						label={t("preview.fit_width")}
						size="sm"
						active={fit === "width"}
						onPress={() => setFitMode("width")}
					/>
					<IconButton
						icon="rotate-left"
						label={t("preview.rotate_left")}
						size="sm"
						onPress={() => setRotation((v) => v - 90)}
					/>
					<IconButton
						icon="rotate-right"
						label={t("preview.rotate_right")}
						size="sm"
						onPress={() => setRotation((v) => v + 90)}
					/>
					{index < items.length - 1 && (
						<IconButton icon="chevron-right" label={t("preview.next")} size="sm" onPress={next} />
					)}
				</div>
			</div>

			<div
				ref={stage}
				onWheel={(event) => {
					event.preventDefault();
					const rect = event.currentTarget.getBoundingClientRect();
					// `rect` and `clientX/Y` are visual; the transform's offsets are
					// layout pixels inside the zoomed page. Dividing by the factor is
					// what keeps the pixel under the cursor still.
					const zoom = currentViewportZoom();
					zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08, {
						x: (event.clientX - rect.left - rect.width / 2) / zoom,
						y: (event.clientY - rect.top - rect.height / 2) / zoom,
					});
				}}
				onPointerDown={(event) => {
					if (scale <= 1 || event.button !== 0) return;
					setDragging(true);
					dragOrigin.current = { x: event.clientX, y: event.clientY, tx, ty };
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					const origin = dragOrigin.current;
					if (!origin) return;
					const zoom = currentViewportZoom();
					setTx(origin.tx + (event.clientX - origin.x) / zoom);
					setTy(origin.ty + (event.clientY - origin.y) / zoom);
				}}
				onPointerUp={() => {
					dragOrigin.current = null;
					setDragging(false);
				}}
				onPointerLeave={() => {
					dragOrigin.current = null;
					setDragging(false);
				}}
				onDoubleClick={() => (scale === 1 ? setScale(2) : reset())}
				className="relative flex flex-1 items-center justify-center overflow-hidden"
				style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
			>
				{src ? (
					<img
						src={src}
						alt={item.name}
						draggable={false}
						className={baseClass}
						style={{
							transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotation}deg)`,
							transition: dragging ? "none" : "transform 0.15s ease",
						}}
					/>
				) : failed ? (
					<StateMessage icon="alert-triangle" tone="danger" title={t("preview.failed_load_img")} />
				) : (
					<Loading size="lg" />
				)}

				{/* §5.3's info panel: an overlay, not a side rail, so the picture keeps
				    the full stage when it is closed. */}
				{showInfo && (
					<dl className="arrive absolute top-2 left-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface/95 p-3 text-xs shadow-md backdrop-blur-sm">
						<dt className="text-neutral-10">{t("preview.details_size")}</dt>
						<dd className="numeric">{formatSize(item.size)}</dd>
						<dt className="text-neutral-10">{t("preview.details_modified")}</dt>
						<dd className="numeric">{formatDate(item.modified)}</dd>
						{typeof item.provider === "string" && (
							<>
								<dt className="text-neutral-10">{t("preview.details_driver")}</dt>
								<dd>{item.provider}</dd>
							</>
						)}
					</dl>
				)}
			</div>
		</div>
	);
}

/** The images in a listing, which is what the lightbox steps through (§5.3). */
export function picturesIn(items: readonly FileObject[]) {
	return items.filter((item) => !item.is_dir && /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(item.name));
}

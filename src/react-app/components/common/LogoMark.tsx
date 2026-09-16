/**
 * The EdgeList mark: the accent tile with an E in it.
 *
 * It was written out twice, once in the header and once above the sign-in form,
 * and the two had drifted apart — `h-9 rounded-lg` against `h-14 rounded-2xl`.
 * The radii were as different as the sizes, so the mark changed shape depending
 * on where it appeared.
 *
 * The radius is a quarter of the tile, expressed as a percentage rather than in
 * pixels: one value that stays correct at every size, including a size nobody
 * has added yet. Two pixel values would have to be kept in step by hand, which
 * is how the drift happened in the first place.
 *
 * The letter is decoration in both places — the wordmark is beside it in the
 * header and the heading is under it on the sign-in page — so it is hidden from
 * assistive technology rather than read out as a stray "E".
 */

const SIZES = {
	sm: { box: "size-9", text: "text-base" },
	lg: { box: "size-14", text: "text-2xl" },
} as const;

export type LogoSize = keyof typeof SIZES;

export function LogoMark({ size = "sm" }: { size?: LogoSize }) {
	const { box, text } = SIZES[size];
	return (
		<div
			aria-hidden="true"
			className={`flex ${box} items-center justify-center rounded-[25%] bg-accent ${text} font-bold text-accent-foreground`}
		>
			E
		</div>
	);
}

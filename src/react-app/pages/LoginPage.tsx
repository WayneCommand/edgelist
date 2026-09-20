import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { LoginResponse } from "../lib/types";
import { ROUTES } from "../routes";
import { useT } from "../hooks/useLocale";
import { LocaleSelect } from "../components/common/LocaleSelect";
import { PasskeyIcon, PrivacyIcon } from "../components/common/icons";
import { Wordmark } from "../components/common/Wordmark";

/**
 * The sign-in screen, drawn to Apple's iCloud sign-in layout.
 *
 * The page is a floating card, unlike every other screen in the app. That is
 * the one thing this rewrite reverses from UI-19, which took the card *away* —
 * and the two are not in conflict once you see what each was arguing about.
 * UI-19's complaint was that the old card *did nothing*: `--background` at
 * 96.4% against `--surface` at 100% is 3.6 points, the library's `.card` has no
 * border and no visible shadow, and the card's only content was a form. So it
 * read as a rectangle of white noise. Here the card is a real sheet: 18px
 * corners, a three-layer shadow tuned per theme, and a set of contents whose
 * own spacing makes the height. The distinction worth keeping is that a card is
 * justified by *what is on it* and by *being lifted*, not by existing.
 *
 * Four things are load-bearing:
 *
 * **The form is still an AK/SK pair.** The design sheet has one field, because
 * it is a page for one Apple ID. This app authenticates a key pair, so the
 * sheet's single field would have to be split back into two anyway; the card's
 * geometry carries over unchanged and the second field costs the page a row.
 * The labels stay where they were, above their fields, now with a placeholder
 * that repeats them — the sheet's field has no label, and the plainer reading
 * for a two-field form is to keep naming them.
 *
 * **The passkey button is a real button that says what is true.** It cannot
 * sign anyone in: this deployment has no WebAuthn endpoint and no credential
 * store. So it is not a disabled control (a disabled call to action reads as
 * "your account is broken") and not a fake one (a button that appears to offer
 * an alternative and silently does the AK/SK thing instead is worse than
 * either). It is pressable, and pressing it says so. The page is then honest at
 * every point: the button exists because the sheet asks for it, and its answer
 * is the truth about this deployment.
 *
 * **The field text size is left unset.** It inherits the document's 16px on
 * purpose: iOS Safari zooms the viewport when a field it focuses is under 16px,
 * and this app is used on phones. That is the same deliberate deviation UI-19
 * recorded, and it now applies to the card's fields as well.
 *
 * **The halo is decoration and is hidden as such.** Ten dots on one element,
 * spinning slowly, with the bloom behind them; `aria-hidden`, and the mark it
 * surrounds is inside the `<h1>`'s own header rather than being an image with a
 * name. `prefers-reduced-motion` stops the spin.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (token: string) => void }) {
	const t = useT();
	const navigate = useNavigate();
	const from = (useLocation().state as { from?: string } | null)?.from ?? ROUTES.files();
	const [accessKey, setAccessKey] = useState("");
	const [secretKey, setSecretKey] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [passkeyNote, setPasskeyNote] = useState("");

	async function submit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError("");
		setPasskeyNote("");
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ access_key: accessKey, secret_key: secretKey }),
			});
			const result = (await response.json()) as LoginResponse;
			if (!response.ok || result.code !== 200 || !result.data?.token)
				throw new Error(result.message || t("login.failed"));
			onSignedIn(result.data.token);
			navigate(from, { replace: true });
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : t("login.failed"));
		} finally {
			setLoading(false);
		}
	}

	return (
		/* `min-h-dvh` rather than `min-h-screen`: on a phone `100vh` includes the
		   browser's collapsing address bar, so the footer sits below the fold and
		   the card is not centred in what the user can actually see.
		   `flex-col` with the card in a `flex-1` middle band is what keeps the
		   card centred *in the window* while the header and the footer stay
		   pinned to its two ends — absolute positioning would need their heights
		   guessed, and the header is two lines tall on a phone. */
		<main className="page-glow flex min-h-dvh flex-col bg-background px-5 py-6 text-foreground sm:px-8">
			<header className="flex items-start justify-between gap-4">
				<Wordmark />
				{/* Outside the app shell, so the picker has to live here too: someone
				    who cannot read the current language has to be able to change it
				    before they can find anything else. */}
				<div className="flex items-center gap-2">
					<LocaleSelect />
					{/* The design sheet's "三点图标（更多/设置选项）". It is the page's
					    least important control and is drawn as such. */}
					<button
						type="button"
						aria-label={t("login.moreOptions")}
						title={t("login.moreOptions")}
						className="tap rounded-full p-1.5 text-signin-muted hover:text-foreground"
					>
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5">
							<circle cx="5" cy="12" r="1.75" />
							<circle cx="12" cy="12" r="1.75" />
							<circle cx="19" cy="12" r="1.75" />
						</svg>
					</button>
				</div>
			</header>

			{/* `my-auto` on the card rather than `justify-center` on the column: with
			    auto margins the card is centred while the header and footer stay
			    where they are, and once the card is taller than the band the margins
			    go to zero instead of clipping it — which on a short phone in
			    landscape is the difference between a scroll and a lost form. */}
			<div className="flex flex-1 items-center justify-center py-8">
				<div className="signin-card w-full max-w-signin px-6 py-8 text-center sm:px-10 sm:py-10">
					<div className="relative mx-auto size-26">
						{/* Bloom first, then the ring on top of it: the ring's dots are
						    crisp points and the haze has to sit behind them. */}
						<div aria-hidden="true" className="signin-halo-bloom absolute inset-0 rounded-full" />
						<div
							aria-hidden="true"
							className="signin-halo absolute inset-0 rounded-full [--halo-radius:40px]"
						/>
						{/* The mark itself. `size-10` and centred, so the ring's 40px radius
						    leaves it clear on every side. It is a rounded square rather than
						    the sheet's circular glyph — the shape carries the mapping back to
						    the app's own mark, which appears in the shell this screen leads
						    to. */}
						<div className="absolute inset-0 flex items-center justify-center">
							<span
								aria-hidden="true"
								className="flex size-10 items-center justify-center rounded-[25%] bg-foreground text-lg font-bold text-background"
							>
								E
							</span>
						</div>
					</div>

					<h1 className="mt-6 text-large-title font-semibold">{t("login.title")}</h1>

					<form className="mt-7 text-left" onSubmit={submit}>
						<label className="block">
							<span className="mb-1.5 block text-label font-medium text-signin-secondary">
								{t("login.accessKey")}
							</span>
							<input
								required
								value={accessKey}
								placeholder={t("login.accessKeyPlaceholder")}
								onChange={(event) => setAccessKey(event.target.value)}
								className="w-full rounded-signin-control px-3.5 py-2.5"
								autoComplete="username"
							/>
						</label>
						<label className="mt-4 block">
							<span className="mb-1.5 block text-label font-medium text-signin-secondary">
								{t("login.secretKey")}
							</span>
							<input
								required
								type="password"
								value={secretKey}
								placeholder={t("login.secretKeyPlaceholder")}
								onChange={(event) => setSecretKey(event.target.value)}
								className="w-full rounded-signin-control px-3.5 py-2.5"
								autoComplete="current-password"
							/>
						</label>

						{/* The banner is mounted at the moment it appears, so it has no
						    before-state to travel from and takes the one-shot `arrive`
						    animation. Same throw and beat as the file list's banner. */}
						{error && (
							<p
								role="alert"
								className="arrive mt-4 rounded-signin-control bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground [--arrive-duration:150ms] [--arrive-from:-4px]"
							>
								{error}
							</p>
						)}

						{/* The submit button is the app's own accent rather than the sheet's
						    dark grey, and the reason is the sheet itself: it draws two
						    buttons, and the *dark* one is the passkey action — which here
						    cannot sign anyone in. The button that actually works is the one
						    that should carry the emphasis, so the emphasis moves to it and
						    the passkey button takes the secondary weight. Same two-button
						    layout, same contrast between them; the roles are the app's. */}
						<button
							type="submit"
							disabled={loading}
							className="tap mt-6 w-full rounded-signin-control bg-accent px-4 py-2.5 font-medium text-accent-foreground disabled:opacity-50"
						>
							{loading ? t("login.signingIn") : t("login.signIn")}
						</button>
					</form>

					{/* The sheet's dark pill, kept at the full pill radius it asks for:
					    a capsule among rounded rectangles is the one shape in this card
					    that reads as "a different kind of thing", and that is exactly
					    what this button is. `bg-foreground` is the near-black the sheet
					    names, which is a token the dark theme already flips. */}
					<button
						type="button"
						onClick={() => {
							setError("");
							setPasskeyNote(t("login.passkeyUnsupported"));
						}}
						className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 font-medium text-background"
					>
						<PasskeyIcon className="size-5" />
						{t("login.passkey")}
					</button>
					<p className="mt-2 text-xs text-signin-muted">{t("login.passkeyHint")}</p>
					{passkeyNote && (
						<p role="status" className="arrive mt-2 text-xs text-signin-muted">
							{passkeyNote}
						</p>
					)}

					{/* The privacy notice, which the sheet puts *below* the buttons. The
					    order matters to the reading: what this is, how to get in, and then
					    what happens to what you typed. */}
					<div className="mt-8 flex flex-col items-center gap-2 border-t border-hairline pt-6">
						<PrivacyIcon className="size-6 text-signin-muted" />
						<p className="text-xs leading-relaxed text-signin-secondary">
							{t("login.privacy")}
							<br />
							<a
								href="https://www.apple.com/legal/privacy/data/en/apple-id/"
								target="_blank"
								rel="noreferrer"
								className="text-signin-link"
							>
								{t("login.privacyLink")}
							</a>
						</p>
					</div>
				</div>
			</div>

			<footer className="flex flex-col items-center gap-2 text-xs text-signin-muted">
				{/* New tab, `noreferrer`: all four links leave the site, and this is
				    the one page reached before any session exists — replacing it
				    loses the page the user was on, and there is no back button to
				    the sign-in form once the login route does not match. */}
				<nav className="flex items-center gap-3">
					<a
						href="https://www.cloudflarestatus.com/"
						target="_blank"
						rel="noreferrer"
						className="tap hover:text-foreground"
					>
						{t("nav.status")}
					</a>
					<span aria-hidden="true">|</span>
					<a
						href="https://www.apple.com/legal/privacy/"
						target="_blank"
						rel="noreferrer"
						className="tap hover:text-foreground"
					>
						{t("nav.privacy")}
					</a>
					<span aria-hidden="true">|</span>
					<a
						href="https://www.apple.com/legal/internet-services/terms/site.html"
						target="_blank"
						rel="noreferrer"
						className="tap hover:text-foreground"
					>
						{t("nav.terms")}
					</a>
				</nav>
				<p>{t("login.copyright")}</p>
			</footer>
		</main>
	);
}

import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { login } from "../lib/api";
import { useLocale } from "../hooks/useStore";
import { ROUTES } from "../routes";
import { ActionButton } from "../ui/ActionButton";
import { LocaleMenu, LogoMark, ThemeMenu } from "../ui/Chrome";
import { Field, TextInput } from "../ui/Field";

/**
 * The sign-in screen, drawn to §10.
 *
 * Two things about it are unusual and both are the spec's.
 *
 * **The backdrop is a brand element, not decoration to be tidied away** (§10.1).
 * Two large arcs sit behind the card — a notched circle in the top right, an open
 * one in the bottom left, both filled with the same blue-violet gradient at the
 * documented angles. They are `position: fixed` and `overflow: hidden`, so the page
 * never scrolls them into view and they crop rather than scale. The paths and
 * offsets below are transcribed from the spec's own numbers.
 *
 * **The record the form takes is a key pair, not a username and a password.** The
 * Worker verifies an AK/SK pair against KV (§Worker `auth.ts`), so the spec's single
 * field would have to be split back into two anyway. The labels keep their own words
 * and the fields keep them above, which is what the spec's layout does for its own
 * fields.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (token: string) => void }) {
	const { t } = useLocale();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const [accessKey, setAccessKey] = useState("");
	const [secretKey, setSecretKey] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);

	// §1.2: `?redirect=` carries the path the user was refused at. Decoding it is
	// what makes a deep link survive a sign-in; a value that is not a path is
	// discarded rather than navigated to.
	const redirectParam = params.get("redirect");
	const redirect = (() => {
		if (!redirectParam) return ROUTES.files();
		try {
			const target = decodeURIComponent(redirectParam);
			return target.startsWith("/") ? target : ROUTES.files();
		} catch {
			return ROUTES.files();
		}
	})();

	async function submit(event: FormEvent) {
		event.preventDefault();
		setError("");
		setPending(true);
		try {
			const result = await login(accessKey, secretKey);
			// The token is written by the caller's `signIn`, which also re-renders
			// the router out of this page — so a navigate here only picks the
			// destination.
			onSignedIn(result.token);
			navigate(redirect, { replace: true });
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : t("login.failed"));
		} finally {
			setPending(false);
		}
	}

	return (
		<LoginBackdrop>
			<main className="relative z-docked flex min-h-dvh flex-col px-5 py-6 sm:px-8">
				<header className="flex items-start justify-between gap-4">
					<span className="flex items-center gap-2.5">
						<LogoMark />
						<span className="text-[15px] font-semibold tracking-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]">
							EdgeList
						</span>
					</span>
					<div className="flex items-center gap-1 rounded-lg bg-white/15 px-1 py-0.5 backdrop-blur-sm">
						<LocaleMenu />
						<ThemeMenu />
					</div>
				</header>

				<div className="flex flex-1 items-center justify-center py-8">
					{/* A sheet, not a white box: the same glass as a macOS login window,
					    with the specular rim doing the work an outer border used to. */}
					<div className="w-full max-w-[372px] rounded-[22px] border border-white/60 bg-white/65 px-7 py-8 shadow-lg backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#2c2c2e]/70">
						<div className="flex items-center justify-center gap-3">
							<LogoMark size="md" />
							<h1 className="text-[19px] font-semibold tracking-tight">{t("login.login_to")} EdgeList</h1>
						</div>

						<form className="mt-7 flex flex-col gap-3.5" onSubmit={submit}>
							<Field label={t("login.username-tips").replace("Input your ", "")} fieldId="login-access-key">
								{(id) => (
									<TextInput
										id={id}
										required
										autoComplete="username"
										autoFocus
										placeholder={t("login.username-tips")}
										value={accessKey}
										onChange={(event) => setAccessKey(event.target.value)}
									/>
								)}
							</Field>
							<Field label={t("login.password-tips").replace("Input your ", "")} fieldId="login-secret-key">
								{(id) => (
									<TextInput
										id={id}
										required
										type="password"
										autoComplete="current-password"
										placeholder={t("login.password-tips")}
										value={secretKey}
										onChange={(event) => setSecretKey(event.target.value)}
									/>
								)}
							</Field>

							{error && (
								<p
									role="alert"
									className="arrive rounded-lg bg-danger-3 px-3 py-2 text-[13px] text-danger-11 [--arrive-from:-4px] [--arrive-duration:150ms]"
								>
									{error}
								</p>
							)}

							<div className="mt-1 flex items-center gap-2">
								{/* §10.2 asks for Clear in the primary colour and Login in the
								    default one. Taken literally against §16's cyan that made the
								    login form's own submit look disabled and gave the page two
								    competing blues. The *hierarchy* is what matters — Clear is
								    the filled button, Login the secondary one — so it is kept,
								    with the brand's own blue on both. */}
								<ActionButton
									tone="soft"
									fullWidth
									type="button"
									onPress={() => {
										// §10.3: Clear empties the fields and nothing else.
										setAccessKey("");
										setSecretKey("");
										setError("");
									}}
								>
									{t("login.clear")}
								</ActionButton>
								<ActionButton tone="primary" fullWidth type="submit" isPending={pending}>
									{t("login.login")}
								</ActionButton>
							</div>
						</form>

						{/* §10.2's guest entry, as a quiet text action rather than a third
						    filled button: the page had three saturated buttons in a row,
						    and only one of them can be the thing to press. */}
						<button
							type="button"
							onClick={() => navigate(ROUTES.files())}
							className="tap mt-4 w-full rounded-lg py-2 text-[13px] font-medium text-info-9 hover:underline"
						>
							{t("login.use_guest")}
						</button>

						<div className="mt-5 flex items-center justify-evenly border-t border-hairline pt-4 text-xs text-neutral-10">
							<span>{t("about.tagline")}</span>
						</div>
					</div>
				</div>

				<footer className="text-center text-[11px] text-white/70">
					<a
						href="https://doc.oplist.org"
						target="_blank"
						rel="noreferrer"
						className="tap hover:text-white hover:underline"
					>
						OpenList
					</a>
				</footer>
			</main>
		</LoginBackdrop>
	);
}

/**
 * §10.1's two arcs, and the flat field they sit on.
 *
 * The shapes are given as paths with fixed coordinates, so the SVG viewBox is their
 * own size and the position is a percentage-free absolute offset — the spec's
 * `right/top` and `left/bottom` values, which crop differently at each breakpoint
 * exactly as it describes.
 */
function LoginBackdrop({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative min-h-dvh overflow-hidden bg-[#a9c6ff] dark:bg-[#062b74]">
			{/* §10.1's two arcs stay — they are the brand's one piece of geometry, and the
			    spec calls them a required part of the visual. What changes is the field
			    they sit on: a macOS wallpaper is a soft wash of colour, not a flat fill,
			    so the arcs now read as depth rather than as two shapes pasted on blue. */}
			<div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
				{/* A wallpaper, not a flat fill: three soft blooms over the base colour.
				    Glass is only legible as glass when there is something behind it to
				    refract, and this is what the card's blur actually reads. */}
				<div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_18%_8%,#e8f1ff_0%,transparent_60%)] dark:bg-[radial-gradient(70%_60%_at_18%_8%,#12409e_0%,transparent_62%)]" />
				<div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_92%_85%,#cfc0ff_0%,transparent_62%)] opacity-80 dark:bg-[radial-gradient(60%_55%_at_92%_85%,#241a6b_0%,transparent_64%)]" />
				<div className="absolute inset-0 bg-[radial-gradient(45%_40%_at_70%_15%,#bfe0ff_0%,transparent_65%)] opacity-70 dark:bg-[radial-gradient(45%_40%_at_70%_15%,#0e5aa8_0%,transparent_68%)]" />
				<svg
					viewBox="0 0 1337 1337"
					className="absolute -top-[1170px] -right-[100px] sm:-top-[900px] sm:-right-[300px]"
					width="1337"
					height="1337"
				>
					<defs>
						<linearGradient id="login-arc-top" x1="0.79" y1="0.62" x2="0.21" y2="0.86">
							<stop offset="0%" stopColor="#28aff0" />
							<stop offset="100%" stopColor="#120fc4" />
						</linearGradient>
					</defs>
					<path
						d="M1337,668.5 C1337,1037.455 1037.455,1337 668.5,1337 C523.673,1337 337,1236 370.5,1094 C434.038,824.673 0,892.628 0,668.5 C0,299.545 299.545,0 668.5,0 C1037.455,0 1337,299.545 1337,668.5 Z"
						fill="url(#login-arc-top)"
					/>
				</svg>
				<svg
					viewBox="0 0 967.885 896"
					className="absolute -bottom-[760px] -left-[100px] sm:-bottom-[400px] sm:-left-[200px]"
					width="967.885"
					height="896"
				>
					<defs>
						<linearGradient id="login-arc-bottom" x1="0.5" y1="0" x2="0.5" y2="1">
							<stop offset="0%" stopColor="#28aff0" />
							<stop offset="100%" stopColor="#120fc4" />
						</linearGradient>
					</defs>
					<path
						d="M896,448 C1142.633,465.575 695.258,896 448,896 C200.742,896 0,695.258 0,448 C0,200.742 200.742,0 448,0 C695.258,0 475,418 896,448 Z"
						fill="url(#login-arc-bottom)"
					/>
				</svg>
			</div>
			{children}
		</div>
	);
}

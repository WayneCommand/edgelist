import { type FormEvent, useState } from "react";
import { Button as HeroButton } from "@heroui/react";
import { useLocation, useNavigate } from "react-router";
import type { LoginResponse } from "../lib/types";
import { ROUTES } from "../routes";
import { useT } from "../hooks/useLocale";
import { LocaleSelect } from "../components/common/LocaleSelect";
import { LogoMark } from "../components/common/LogoMark";

/**
 * The sign-in screen.
 *
 * It was a white card centred on the window grey, and the card was doing
 * nothing: the window is 96.4% and the card 100%, the library's `.card` has no
 * border, and the only thing inside it was a form. So the page read as a
 * fragment of some other page that had been dropped onto a background.
 *
 * There is no surface here now. The window colour is the page, a very light
 * radial lift at the top (`.page-glow`) gives the mark and the heading
 * something to sit in, and the only two raised things on screen are the fields,
 * which are white. Elevation is spent on what can be typed into rather than on
 * a box drawn around it, and the button is the single accent.
 *
 * What changed from the card version, and why:
 *
 * - `max-w-md` to `max-w-sm`. At 448px the form was a wide, sparse block; the
 *   column is now narrow enough for the eye to take the whole screen in at
 *   once, which is the shape every sign-in page converges on.
 * - The 24px heading to `--text-large-title` (28px). This is the one screen in
 *   the app that is a page rather than a toolbar, which is what that token is
 *   for; the toolbar pages move to 17px in the shell step.
 * - Labels from 14px in full-strength foreground to 13px muted. A label names
 *   the field below it and does not need to compete with what the user typed.
 * - Fields from `py-3` to `py-2.5`, and the button separated by its own margin
 *   rather than by the fields' rhythm, because it is a different kind of thing
 *   from the fields above it.
 *
 * The field text size is left unset, so it inherits the document's 16px. That
 * is deliberate: iOS Safari zooms the viewport when a field it focuses is
 * under 16px, and this app is used on phones.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: (token: string) => void }) {
	const t = useT();
	const navigate = useNavigate();
	const from = (useLocation().state as { from?: string } | null)?.from ?? ROUTES.files();
	const [accessKey, setAccessKey] = useState("");
	const [secretKey, setSecretKey] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	async function submit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError("");
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
		<main className="page-glow relative flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
			{/* Outside the app shell, so the picker has to live here too: someone
			    who cannot read the current language has to be able to change it
			    before they can find anything else. `main` is the positioning
			    context, so it belongs to this screen rather than to the document. */}
			<div className="absolute top-5 right-6">
				<LocaleSelect />
			</div>
			<div className="w-full max-w-sm">
				<header className="flex flex-col items-center text-center">
					<LogoMark size="lg" />
					<h1 className="mt-5 text-large-title font-semibold">{t("login.title")}</h1>
					<p className="mt-2 text-sm text-muted">{t("login.subtitle")}</p>
				</header>
				<form className="mt-9" onSubmit={submit}>
					<div className="space-y-4">
						<label className="block">
							<span className="mb-1.5 block text-label font-medium text-muted">{t("login.accessKey")}</span>
							<input
								required
								value={accessKey}
								onChange={(event) => setAccessKey(event.target.value)}
								className="w-full px-3.5 py-2.5"
								autoComplete="username"
							/>
						</label>
						<label className="block">
							<span className="mb-1.5 block text-label font-medium text-muted">{t("login.secretKey")}</span>
							<input
								required
								type="password"
								value={secretKey}
								onChange={(event) => setSecretKey(event.target.value)}
								className="w-full px-3.5 py-2.5"
								autoComplete="current-password"
							/>
						</label>
						{/* The banner is mounted at the moment it appears, so it has no
						    before-state to travel from and takes the one-shot `arrive`
						    animation. Same throw and beat as the file list's banner. */}
						{error && (
							<p
								role="alert"
								className="arrive rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground [--arrive-duration:150ms] [--arrive-from:-4px]"
							>
								{error}
							</p>
						)}
					</div>
					{/* Its own margin rather than the fields': the button is not the
					    next field, and 16px would make it read as one. */}
					<HeroButton type="submit" fullWidth isPending={loading} className="mt-6">
						{loading ? t("login.signingIn") : t("login.signIn")}
					</HeroButton>
				</form>
				<p className="mt-6 text-center text-xs text-muted">{t("login.verified")}</p>
			</div>
		</main>
	);
}

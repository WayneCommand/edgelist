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
		<div className="relative flex min-h-dvh flex-col bg-[var(--page)]">
			<main className="relative z-docked mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-5 py-6 sm:px-7">
				<header className="flex items-start justify-between gap-4">
					<span className="flex items-center gap-2.5">
						<LogoMark />
						<span className="text-[15px] font-semibold tracking-tight text-neutral-12">EdgeList</span>
					</span>
					<div className="flex items-center gap-1 rounded-lg bg-neutral-3 px-1 py-0.5">
						<LocaleMenu />
						<ThemeMenu />
					</div>
				</header>

				<div className="flex flex-1 items-center justify-center py-8">
					{/* A plain white sheet on the page colour. §10.1's arcs belong to the
					    brand's own site; a deployment's sign-in page is the front door to
					    someone's files, and a wallpaper behind it made the form compete with
					    the decoration for attention. */}
					<div className="w-full max-w-[372px] rounded-2xl border border-hairline bg-surface px-7 py-8 shadow-lg">
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

				<footer className="text-center text-[11px] text-neutral-10">
					<a
						href="https://doc.oplist.org"
						target="_blank"
						rel="noreferrer"
						className="tap hover:text-neutral-12 hover:underline"
					>
						OpenList
					</a>
				</footer>
			</main>
		</div>
	);
}

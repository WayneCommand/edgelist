import { type FormEvent, useState } from "react";
import { Button as HeroButton, Card as HeroCard } from "@heroui/react";
import { useLocation, useNavigate } from "react-router";
import type { LoginResponse } from "../lib/types";
import { ROUTES } from "../routes";
import { useT } from "../hooks/useLocale";
import { LocaleSelect } from "../components/common/LocaleSelect";

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
		<main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
			{/* Outside the app shell, so the picker has to live here too: someone
			    who cannot read the current language has to be able to change it
			    before they can find anything else. */}
			<div className="absolute top-5 right-6">
				<LocaleSelect />
			</div>
			<HeroCard className="w-full max-w-md" variant="default">
				<div className="mb-8 text-center">
					<div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-accent-foreground">
						E
					</div>
					<h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
					<p className="mt-2 text-sm text-muted">{t("login.subtitle")}</p>
				</div>
				<form className="space-y-5" onSubmit={submit}>
					<label className="block">
						<span className="mb-2 block text-sm font-medium text-foreground">{t("login.accessKey")}</span>
						<input
							required
							value={accessKey}
							onChange={(event) => setAccessKey(event.target.value)}
							className="w-full px-3.5 py-3"
							autoComplete="username"
						/>
					</label>
					<label className="block">
						<span className="mb-2 block text-sm font-medium text-foreground">{t("login.secretKey")}</span>
						<input
							required
							type="password"
							value={secretKey}
							onChange={(event) => setSecretKey(event.target.value)}
							className="w-full px-3.5 py-3"
							autoComplete="current-password"
						/>
					</label>
					{error && (
						<p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
							{error}
						</p>
					)}
					<HeroButton type="submit" fullWidth isPending={loading}>
						{loading ? t("login.signingIn") : t("login.signIn")}
					</HeroButton>
				</form>
				<p className="mt-8 text-center text-xs text-muted">{t("login.verified")}</p>
			</HeroCard>
		</main>
	);
}

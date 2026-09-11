import { type FormEvent, useState } from "react";
import { Button as HeroButton, Card as HeroCard } from "@heroui/react";
import { useLocation, useNavigate } from "react-router";
import type { LoginResponse } from "../lib/types";
import { ROUTES } from "../routes";

export function LoginPage({ onSignedIn }: { onSignedIn: (token: string) => void }) {
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
			if (!response.ok || result.code !== 200 || !result.data?.token) throw new Error(result.message || "Login failed");
			onSignedIn(result.data.token);
			navigate(from, { replace: true });
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Login failed");
		} finally {
			setLoading(false);
		}
	}
	return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"><HeroCard className="w-full max-w-md" variant="default"><div className="mb-8 text-center"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-accent-foreground">E</div><h1 className="text-2xl font-semibold tracking-tight">Sign in to EdgeList</h1><p className="mt-2 text-sm text-muted">OpenList-compatible file management</p></div><form className="space-y-5" onSubmit={submit}><label className="block"><span className="mb-2 block text-sm font-medium text-foreground">Access Key</span><input required value={accessKey} onChange={(event) => setAccessKey(event.target.value)} className="w-full rounded-lg border border-border bg-field-background px-3.5 py-3 outline-none transition focus:border-focus focus:ring-4 focus:ring-accent/15" autoComplete="username" /></label><label className="block"><span className="mb-2 block text-sm font-medium text-foreground">Secret Key</span><input required type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} className="w-full rounded-lg border border-border bg-field-background px-3.5 py-3 outline-none transition focus:border-focus focus:ring-4 focus:ring-accent/15" autoComplete="current-password" /></label>{error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}<HeroButton type="submit" fullWidth isPending={loading}>{loading ? "Signing in…" : "Sign in"}</HeroButton></form><p className="mt-8 text-center text-xs text-muted">Credentials are verified securely by the Worker.</p></HeroCard></main>;
}

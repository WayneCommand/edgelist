import { type FormEvent, useState } from "react";

type LoginResponse = { code: number; message: string; data?: { token: string } };

function App() {
	const [accessKey, setAccessKey] = useState("");
	const [secretKey, setSecretKey] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [signedIn, setSignedIn] = useState(Boolean(sessionStorage.getItem("edgelist-token")));

	async function submit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError("");
		try {
			const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ access_key: accessKey, secret_key: secretKey }) });
			const result = (await response.json()) as LoginResponse;
			if (!response.ok || result.code !== 200 || !result.data?.token) throw new Error(result.message || "Login failed");
			sessionStorage.setItem("edgelist-token", result.data.token);
			setSignedIn(true);
		} catch (reason) { setError(reason instanceof Error ? reason.message : "Login failed"); }
		finally { setLoading(false); }
	}

	if (signedIn) return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-800"><section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-slate-200/60"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">E</div><h1 className="text-2xl font-semibold">Welcome to EdgeList</h1><p className="mt-2 text-sm text-slate-500">Your OpenList-compatible workspace is ready.</p><button className="mt-7 w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50" onClick={() => { sessionStorage.removeItem("edgelist-token"); setSignedIn(false); }}>Sign out</button></section></main>;

	return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-800"><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/60"><div className="mb-8 text-center"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">E</div><h1 className="text-2xl font-semibold tracking-tight">Sign in to EdgeList</h1><p className="mt-2 text-sm text-slate-500">OpenList-compatible file management</p></div><form className="space-y-5" onSubmit={submit}><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Access Key</span><input required value={accessKey} onChange={(event) => setAccessKey(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3.5 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="username" /></label><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Secret Key</span><input required type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3.5 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="current-password" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button></form><p className="mt-8 text-center text-xs text-slate-400">Credentials are verified securely by the Worker.</p></section></main>;
}

export default App;

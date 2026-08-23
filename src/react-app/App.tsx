import { type FormEvent, useState } from "react";

type LoginResponse = { code: number; message: string; data?: { token: string } };
type FileItem = { name: string; size: number; is_dir: boolean; modified: string; path: string };

function FileBrowser({ signOut }: { signOut: () => void }) {
	const [path, setPath] = useState("/");
	const [items, setItems] = useState<FileItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	async function load(nextPath = path) {
		setLoading(true);
		setError("");
		try {
			const response = await fetch("/api/fs/list", { method: "POST", headers: { "content-type": "application/json", Authorization: sessionStorage.getItem("edgelist-token") ?? "" }, body: JSON.stringify({ path: nextPath, page: 1, per_page: 100 }) });
			const result = (await response.json()) as { code: number; message: string; data?: { content: FileItem[] } };
			if (!response.ok || result.code !== 200) throw new Error(result.message || "Unable to load files");
			setPath(nextPath); setItems(result.data?.content ?? []);
		} catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load files"); }
		finally { setLoading(false); }
	}

	return <main className="min-h-screen bg-slate-50 text-slate-800"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">E</div><span className="font-semibold">EdgeList</span></div><button className="text-sm text-slate-500 hover:text-slate-800" onClick={signOut}>Sign out</button></header><div className="mx-auto max-w-6xl p-6"><div className="mb-6 flex items-center justify-between"><div><p className="text-sm text-slate-400">Files</p><h1 className="mt-1 text-2xl font-semibold">{path === "/" ? "All files" : path.split("/").filter(Boolean).pop()}</h1></div><button onClick={() => load()} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Refresh</button></div><div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><button onClick={() => load("/")} className="hover:text-blue-600">Root</button>{path.split("/").filter(Boolean).map((part, index, parts) => { const crumb = `/${parts.slice(0, index + 1).join("/")}`; return <span key={crumb}>/ <button onClick={() => load(crumb)} className="hover:text-blue-600">{part}</button></span>; })}</div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">{error}</p>}{!items.length && !loading ? <div className="p-16 text-center text-sm text-slate-400">{path === "/" ? "No files yet" : "This folder is empty"}</div> : <div>{items.map((item) => <button key={item.path} className="flex w-full items-center gap-4 border-b border-slate-100 px-5 py-4 text-left last:border-0 hover:bg-slate-50" onDoubleClick={() => item.is_dir && load(item.path)}><span className="text-2xl">{item.is_dir ? "📁" : "📄"}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span><span className="hidden w-32 text-right text-xs text-slate-400 sm:block">{item.is_dir ? "Folder" : `${Math.round(item.size / 1024)} KB`}</span><span className="hidden w-44 text-right text-xs text-slate-400 md:block">{item.modified ? new Date(item.modified).toLocaleDateString() : "—"}</span></button>)}</div>}{loading && <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Loading…</div>}</section>{!items.length && !loading && <button onClick={() => load()} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Load files</button>}</div></main>;
}

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

	if (signedIn) return <FileBrowser signOut={() => { sessionStorage.removeItem("edgelist-token"); setSignedIn(false); }} />;

	return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-800"><section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/60"><div className="mb-8 text-center"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">E</div><h1 className="text-2xl font-semibold tracking-tight">Sign in to EdgeList</h1><p className="mt-2 text-sm text-slate-500">OpenList-compatible file management</p></div><form className="space-y-5" onSubmit={submit}><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Access Key</span><input required value={accessKey} onChange={(event) => setAccessKey(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3.5 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="username" /></label><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Secret Key</span><input required type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3.5 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="current-password" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button></form><p className="mt-8 text-center text-xs text-slate-400">Credentials are verified securely by the Worker.</p></section></main>;
}

export default App;

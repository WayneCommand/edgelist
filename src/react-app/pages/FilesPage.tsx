import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button as HeroButton, Skeleton } from "@heroui/react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../lib/api";
import { formatSize, languageForFile } from "../lib/format";
import type { FileItem } from "../lib/types";
import { ROUTES, filesPathFor } from "../routes";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useNotify } from "../hooks/useNotify";
import { MonacoTextEditor } from "../components/common/MonacoTextEditor";
import { Modal } from "../components/common/Modal";
import { FileListSkeleton } from "../components/files/FileListSkeleton";

export function FilesPage() {
	const notify = useNotify();
	const confirm = useConfirm();
	const { token } = useAuth();
	const navigate = useNavigate();
	const initialPath = filesPathFor(useLocation().pathname);
	function openDirectory(next: string) {
		navigate({ pathname: ROUTES.files(next) });
	}
	const [path, setPath] = useState(initialPath);
	const [items, setItems] = useState<FileItem[]>([]);
	const [selected, setSelected] = useState<FileItem | null>(null);
	const [preview, setPreview] = useState<{ item: FileItem; content: string } | null>(null);
	const [previewContent, setPreviewContent] = useState("");
	const [previewDirty, setPreviewDirty] = useState(false);
	const [previewSaving, setPreviewSaving] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [loading, setLoading] = useState(false);
	const [modal, setModal] = useState<"mkdir" | "rename" | null>(null);
	const [value, setValue] = useState("");
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	async function load(nextPath = path) {
		setLoading(true); setError(""); setSelected(null);
		try { const data = await api<{ content: FileItem[] }>("/api/fs/list", { method: "POST", body: JSON.stringify({ path: nextPath, page: 1, per_page: 200 }) }); setPath(nextPath); setItems(data.content ?? []); }
		catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load files"); }
		finally { setLoading(false); }
	}
	// The URL is the source of truth for the current file directory.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => { setSearching(false); setQuery(""); void load(initialPath); }, [initialPath]);
	async function search(event?: FormEvent) {
		event?.preventDefault(); if (!query.trim()) return load(path); setSearching(true); setLoading(true); setError("");
		try { const data = await api<{ content: FileItem[] }>("/api/fs/search", { method: "POST", body: JSON.stringify({ parent: path, keywords: query, scope: 0, page: 1, per_page: 200 }) }); setItems(data.content ?? []); }
		catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to search files"); } finally { setLoading(false); }
	}
	async function createFolder(event: FormEvent) { event.preventDefault(); try { await api("/api/fs/mkdir", { method: "POST", body: JSON.stringify({ path: `${path.replace(/\/$/, "")}/${value}` }) }); notify("Folder created"); setModal(null); setValue(""); await load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to create folder", true); } }
	async function rename(event: FormEvent) { event.preventDefault(); if (!selected) return; try { await api("/api/fs/rename", { method: "POST", body: JSON.stringify({ path: selected.path, name: value, overwrite: false }) }); notify("Renamed"); setModal(null); setSelected(null); await load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to rename", true); } }
	async function remove() {
		if (!selected) return;
		if (!(await confirm({ title: "Delete", message: `Delete ${selected.name}?` }))) return;
		try { await api("/api/fs/remove", { method: "POST", body: JSON.stringify({ dir: path, names: [selected.name] }) }); notify("Deleted"); setSelected(null); await load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to delete", true); } }
	async function upload(file: File) { try { await api("/api/fs/put", { method: "PUT", headers: { "File-Path": encodeURIComponent(`${path.replace(/\/$/, "")}/${file.name}`), "Content-Type": file.type || "application/octet-stream" }, body: file }); notify("Uploaded"); await load(); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to upload", true); } }
	async function download(item: FileItem) { try { const response = await fetch(`/d${item.path}`, { headers: { Authorization: token } }); if (!response.ok) throw new Error("Download failed"); const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = item.name; link.click(); URL.revokeObjectURL(link.href); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to download", true); } }
	function isPreviewable(name: string) { return languageForFile(name) !== null; }
	async function previewFile(item: FileItem) { setPreviewLoading(true); try { const response = await fetch(`/d${item.path}`, { headers: { Authorization: token } }); if (!response.ok) throw new Error("Unable to preview file"); const content = await response.text(); setPreview({ item, content }); setPreviewContent(content); setPreviewDirty(false); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to preview file", true); } finally { setPreviewLoading(false); } }
	async function savePreview() { if (!preview) return; setPreviewSaving(true); try { await api("/api/fs/put", { method: "PUT", headers: { "File-Path": encodeURIComponent(preview.item.path), "Content-Type": "text/plain; charset=utf-8" }, body: new Blob([previewContent], { type: "text/plain; charset=utf-8" }) }); setPreview({ ...preview, content: previewContent }); setPreviewDirty(false); notify("Saved"); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to save file", true); } finally { setPreviewSaving(false); } }
	async function closePreview() {
		if (previewDirty && !(await confirm({ title: "Discard changes", message: "Discard unsaved changes?", confirmLabel: "Discard" }))) return;
		setPreview(null); setPreviewContent(""); setPreviewDirty(false); }
	async function openFile(item: FileItem) { if (item.is_dir) { openDirectory(item.path); return; } if (isPreviewable(item.name)) { await previewFile(item); return; } await download(item); }
	const crumbs = path.split("/").filter(Boolean);
	return <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-400">Files</p><h1 className="mt-1 text-2xl font-semibold">{searching ? `Search: ${query}` : path === "/" ? "All files" : crumbs[crumbs.length - 1]}</h1></div><div className="flex gap-2"><HeroButton size="sm" variant="secondary" onPress={() => void load()}>Refresh</HeroButton><HeroButton size="sm" onPress={() => inputRef.current?.click()}>Upload</HeroButton><input ref={inputRef} hidden type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></div></div><form className="mb-4 flex gap-2" onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files…" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /><HeroButton type="submit" size="sm" variant="secondary">Search</HeroButton>{searching && <HeroButton type="button" size="sm" variant="ghost" onPress={() => { setQuery(""); setSearching(false); void load(path); }}>Clear</HeroButton>}</form><div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><button onClick={() => { setSearching(false); openDirectory("/"); }} className="hover:text-blue-600">Root</button>{!searching && crumbs.map((part, index) => { const crumb = `/${crumbs.slice(0, index + 1).join("/")}`; return <span key={crumb}>/ <button onClick={() => openDirectory(crumb)} className="hover:text-blue-600">{part}</button></span>; })}</div><div className="mb-3 flex min-h-9 items-center gap-2">{selected && <><span className="text-sm text-slate-500">Selected: {selected.name}</span>{!selected.is_dir && (isPreviewable(selected.name) ? <HeroButton size="sm" variant="outline" onPress={() => void previewFile(selected)}>Preview/Edit</HeroButton> : <HeroButton size="sm" variant="outline" onPress={() => void download(selected)}>Download</HeroButton>)}<HeroButton size="sm" variant="outline" onPress={() => { setValue(selected.name); setModal("rename"); }}>Rename</HeroButton><HeroButton size="sm" variant="danger" onPress={() => void remove()}>Delete</HeroButton></>}<HeroButton className="ml-auto" size="sm" variant="outline" onPress={() => { setValue(""); setModal("mkdir"); }}>New folder</HeroButton></div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">{error}</p>}{loading ? <FileListSkeleton /> : !items.length ? <div className="p-16 text-center text-sm text-slate-400">No files found</div> : <div>{items.map((item) => <button key={item.path} className={`flex w-full items-center gap-4 border-b border-slate-100 px-5 py-4 text-left last:border-0 hover:bg-slate-50 ${selected?.path === item.path ? "bg-blue-50" : ""}`} onClick={() => setSelected(item)} onDoubleClick={() => !searching && void openFile(item)}><span className="text-2xl">{item.is_dir ? "📁" : "📄"}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span><span className="hidden w-32 text-right text-xs text-slate-400 sm:block">{item.is_dir ? "Folder" : formatSize(item.size)}</span><span className="hidden w-36 text-right text-xs text-slate-400 md:block">{item.modified ? new Date(item.modified).toLocaleDateString() : "—"}</span></button>)}</div>}</section>{modal === "mkdir" && <Modal title="New folder" onClose={() => setModal(null)}><form className="space-y-4" onSubmit={createFolder}><input autoFocus required value={value} onChange={(event) => setValue(event.target.value)} placeholder="Folder name" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" /><HeroButton type="submit" fullWidth>Create</HeroButton></form></Modal>}{modal === "rename" && <Modal title="Rename" onClose={() => setModal(null)}><form className="space-y-4" onSubmit={rename}><input autoFocus required value={value} onChange={(event) => setValue(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" /><HeroButton type="submit" fullWidth>Save</HeroButton></form></Modal>}{previewLoading && <Modal title="Preview" onClose={() => setPreviewLoading(false)}><Skeleton className="h-48 w-full rounded-lg" /></Modal>}{preview && <Modal wide title={`${preview.item.name}${previewDirty ? " *" : ""}`} onClose={closePreview}><div className="space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted">{languageForFile(preview.item.name)?.toUpperCase()} · 在线编辑</p><HeroButton size="sm" isDisabled={!previewDirty || previewSaving} onPress={() => void savePreview()}>{previewSaving ? "Saving…" : "Save"}</HeroButton></div><MonacoTextEditor key={preview.item.path} value={previewContent} language={languageForFile(preview.item.name) ?? "plaintext"} path={preview.item.path} onChange={(content) => { setPreviewContent(content); setPreviewDirty(content !== preview.content); }} /></div></Modal>}</section>;
}

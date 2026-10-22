import { Hono } from "hono";
import type { EdgeListBindings } from "./env";
import { respond } from "./response";
import { currentUser, login, logout, requireAuth } from "./auth";
import {
	fileDownload,
	fsCopy,
	fsDirs,
	fsFormUpload,
	fsGet,
	fsLink,
	fsList,
	fsMkdir,
	fsMove,
	fsPut,
	fsRemove,
	fsRemoveEmptyDirectory,
	fsRename,
	fsSearch,
} from "./fs";
import {
	fsMultipartAbort,
	fsMultipartChunk,
	fsMultipartComplete,
	fsMultipartInit,
	fsMultipartStatus,
} from "./multipart";
import {
	driverInfo,
	driverList,
	driverNames,
	metaDelete,
	metaList,
	metaSave,
	storageCreate,
	storageDelete,
	storageDisable,
	storageEnable,
	storageGet,
	storageList,
	storageLoadAll,
	storageUpdate,
} from "./admin";
import { backupExport, backupRestore } from "./backup";
import { shareCreate, shareDelete, shareDownload, shareGet, shareList, shareState, shareUpdate } from "./share";

const app = new Hono<{ Bindings: Env & EdgeListBindings }>();

app.get("/api/", (c) => respond(c, { name: "EdgeList" }));
app.post("/api/auth/login", (c) => login(c));
app.post("/api/auth/login/hash", (c) => login(c, true));
app.get("/api/auth/logout", requireAuth, logout);
app.get("/api/me", requireAuth, currentUser);
app.post("/api/fs/list", requireAuth, fsList);
app.post("/api/fs/get", requireAuth, fsGet);
app.post("/api/fs/mkdir", requireAuth, fsMkdir);
app.post("/api/fs/rename", requireAuth, fsRename);
app.post("/api/fs/copy", requireAuth, fsCopy);
app.post("/api/fs/move", requireAuth, fsMove);
app.post("/api/fs/remove", requireAuth, fsRemove);
app.post("/api/fs/search", requireAuth, fsSearch);
app.post("/api/fs/dirs", requireAuth, fsDirs);
app.post("/api/fs/remove_empty_directory", requireAuth, fsRemoveEmptyDirectory);
app.post("/api/fs/link", requireAuth, fsLink);
app.put("/api/fs/put", requireAuth, fsPut);
app.put("/api/fs/form", requireAuth, fsFormUpload);
app.post("/api/fs/multipart/init", requireAuth, fsMultipartInit);
// A chunk is bytes being placed, so it is a PUT, as it is upstream. The other
// four follow OpenList's shape except `status`, which takes a JSON body here
// rather than upstream's query lookup — nothing else needs the richer form.
app.put("/api/fs/multipart/chunk", requireAuth, fsMultipartChunk);
app.post("/api/fs/multipart/complete", requireAuth, fsMultipartComplete);
app.post("/api/fs/multipart/status", requireAuth, fsMultipartStatus);
app.post("/api/fs/multipart/abort", requireAuth, fsMultipartAbort);
// The wildcard must be named. Hono does not expose a bare `*` as a param, so
// `/d/*` left `c.req.param("*")` null, the path collapsed to "/", and every
// download — and every URL `/api/fs/link` hands out — answered 404.
app.on(["GET", "HEAD"], "/d/:name{.*}", requireAuth, fileDownload);
app.get("/api/admin/storage/list", requireAuth, storageList);
app.get("/api/admin/storage/get", requireAuth, storageGet);
app.post("/api/admin/storage/create", requireAuth, storageCreate);
app.post("/api/admin/storage/update", requireAuth, storageUpdate);
app.post("/api/admin/storage/delete", requireAuth, storageDelete);
app.post("/api/admin/storage/enable", requireAuth, storageEnable);
app.post("/api/admin/storage/disable", requireAuth, storageDisable);
app.post("/api/admin/storage/load_all", requireAuth, storageLoadAll);
app.get("/api/admin/meta/list", requireAuth, metaList);
app.post("/api/admin/meta/create", requireAuth, metaSave);
app.post("/api/admin/meta/update", requireAuth, metaSave);
app.post("/api/admin/meta/delete", requireAuth, metaDelete);
app.post("/api/admin/backup/export", requireAuth, backupExport);
app.post("/api/admin/backup/restore", requireAuth, backupRestore);
app.get("/api/admin/driver/names", requireAuth, driverNames);
app.get("/api/admin/driver/list", requireAuth, driverList);
app.get("/api/admin/driver/info", requireAuth, driverInfo);

// Shares. Management is authenticated; the two public routes are not — that is
// the entire point of a share. The address is the file's own path, so a nested
// file keeps its shape: `/s/waynecos/token.md` is the page and
// `/s/waynecos/token.md/download` is the file.
app.get("/api/share/list", requireAuth, shareList);
app.post("/api/share/create", requireAuth, shareCreate);
app.post("/api/share/update", requireAuth, shareUpdate);
app.post("/api/share/delete", requireAuth, shareDelete);
app.post("/api/share/state", requireAuth, shareState);
app.get("/api/s/:path{.*}", shareGet);
// A browser opening `/s/.../download` is a *navigation* request, and the asset
// router would answer it with `index.html` without ever invoking this Worker
// when `not_found_handling` is `single-page-application` — which is why the
// direct link used to land on the sign-in screen. `wrangler.json` runs the
// Worker first for this path so the route below is actually reached.
//
// `OPTIONS` is routed here rather than left to the asset handler: a link meant to
// be embedded has to answer its own preflight, and the Worker is the only thing
// that knows the share's CORS policy.
app.on(["GET", "HEAD", "OPTIONS"], "/s/:path{.*}/download", shareDownload);

export default app;

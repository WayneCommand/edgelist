import { Hono } from "hono";
import type { EdgeListBindings } from "./env";
import { respond } from "./response";
import { currentUser, login, logout, requireAuth } from "./auth";
import { fileDownload, fsGet, fsList, fsMkdir, fsPut, fsRemove, fsRename } from "./fs";

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
app.post("/api/fs/remove", requireAuth, fsRemove);
app.put("/api/fs/put", requireAuth, fsPut);
app.on(["GET", "HEAD"], "/d/*", requireAuth, fileDownload);

export default app;

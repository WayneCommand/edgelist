import { Hono } from "hono";
import type { EdgeListBindings } from "./env";
import { respond } from "./response";
import { currentUser, login, logout, requireAuth } from "./auth";

const app = new Hono<{ Bindings: Env & EdgeListBindings }>();

app.get("/api/", (c) => respond(c, { name: "EdgeList" }));
app.post("/api/auth/login", (c) => login(c));
app.post("/api/auth/login/hash", (c) => login(c, true));
app.get("/api/auth/logout", requireAuth, logout);
app.get("/api/me", requireAuth, currentUser);

export default app;

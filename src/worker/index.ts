import { Hono } from "hono";
import type { EdgeListBindings } from "./env";
import { respond } from "./response";

const app = new Hono<{ Bindings: Env & EdgeListBindings }>();

app.get("/api/", (c) => respond(c, { name: "EdgeList" }));

export default app;

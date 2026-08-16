import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppEnvironment } from "./types.js";
import { health } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { discogsRoutes } from "./routes/discogs.js";
import { sessionRoutes } from "./routes/session.js";

export function createApp(environment: AppEnvironment): Hono<{ Bindings: AppEnvironment }> {
  const app = new Hono<{ Bindings: AppEnvironment }>();
  app.use("*", cors({
    origin: (origin) => {
      if (!origin) return "";
      const allowed = ["http://localhost:5173", "http://localhost:3000", ...environment.allowedOrigins, environment.publicAppOrigin];
      return allowed.includes(origin) ? origin : "";
    },
    credentials: true,
  }));
  app.route("/api", health);
  app.route("/api/auth", authRoutes);
  app.route("/api/discogs", discogsRoutes);
  app.route("/api/session", sessionRoutes);
  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/") || c.req.method !== "GET") return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    const requestedPath = decodeURIComponent(c.req.path).replace(/^\/+/, "");
    if (!requestedPath.includes("..")) {
      try {
        const file = await readFile(join(environment.staticRoot, requestedPath));
        const contentType = requestedPath.endsWith(".js") ? "text/javascript" : requestedPath.endsWith(".css") ? "text/css" : requestedPath.endsWith(".svg") ? "image/svg+xml" : undefined;
        return new Response(file, { headers: { ...(contentType ? { "Content-Type": contentType } : {}), "Cache-Control": requestedPath.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache" } });
      } catch {
        // Fall through to the SPA shell for browser routes.
      }
    }
    try {
      return new Response(await readFile(join(environment.staticRoot, "index.html")), { headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-cache" } });
    } catch {
      return c.text("Not found", 404);
    }
  });
  app.notFound((c) => c.req.path.startsWith("/api/") ? c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404) : c.text("Not found", 404));
  return app;
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { AppEnvironment } from "./types.js";
import { health } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { discogsRoutes } from "./routes/discogs.js";
import { sessionRoutes } from "./routes/session.js";

function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

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
    if (isApiPath(c.req.path) || c.req.method !== "GET") return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    let requestedPath: string;
    try {
      requestedPath = decodeURIComponent(c.req.path).replace(/^\/+/, "");
    } catch {
      return c.text("Not found", 404);
    }
    const staticRoot = resolve(environment.staticRoot);
    const requestedFile = resolve(staticRoot, requestedPath);
    if (requestedFile === staticRoot || requestedFile.startsWith(`${staticRoot}${sep}`)) {
      try {
        const file = await readFile(requestedFile);
        const contentType = requestedPath.endsWith(".js") ? "text/javascript" : requestedPath.endsWith(".css") ? "text/css" : requestedPath.endsWith(".svg") ? "image/svg+xml" : undefined;
        return new Response(file, { headers: { ...(contentType ? { "Content-Type": contentType } : {}), "Cache-Control": requestedPath.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache" } });
      } catch {
        // Fall through to the SPA shell for browser routes.
      }
    }
    try {
      return new Response(await readFile(resolve(environment.staticRoot, "index.html")), { headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-cache" } });
    } catch {
      return c.text("Not found", 404);
    }
  });
  app.notFound((c) => isApiPath(c.req.path) ? c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404) : c.text("Not found", 404));
  return app;
}

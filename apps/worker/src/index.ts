import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { discogsRoutes } from "./routes/discogs.js";
import { sessionRoutes } from "./routes/session.js";
import type { CloudflareBinding } from "./types.js";

const app = new Hono<{ Bindings: CloudflareBinding }>();

// CORS middleware with allowlist from environment
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const env = c.env as CloudflareBinding;
      const defaultOrigins = [
        "http://localhost:5173",
        "http://localhost:8787",
      ];
      const envOrigins = env.ALLOWED_ORIGINS
        ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : [];
      const allowedOrigins = [
        ...defaultOrigins,
        ...envOrigins,
        env.PUBLIC_APP_ORIGIN,
      ].filter(Boolean);
      if (!origin) {
        return "";
      }
      return allowedOrigins.includes(origin) ? origin : "";
    },
    credentials: true,
  })
);

// API routes
app.route("/api", health);
app.route("/api/auth", authRoutes);
app.route("/api/discogs", discogsRoutes);
app.route("/api/session", sessionRoutes);

export default app;

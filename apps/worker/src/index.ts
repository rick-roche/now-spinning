import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { discogsRoutes } from "./routes/discogs.js";
import { sessionRoutes } from "./routes/session.js";
import type { CloudflareBinding } from "./types.js";

const app = new Hono<{ Bindings: CloudflareBinding }>();

// CORS middleware with allowlist from environment
// Set ALLOWED_ORIGINS env var to comma-separated list (e.g., "http://localhost:5173,https://yourdomain.pages.dev")
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:8787",
        "https://now-spinning.pages.dev"
      ];
      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? origin;
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

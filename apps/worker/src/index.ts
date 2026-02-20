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
      try {
        const env = c.env as CloudflareBinding;
        const allowedOrigins = [
          "http://localhost:5173",
          "http://localhost:8787",
          "https://now-spinning.rickroche.com",
          env.PUBLIC_APP_ORIGIN,
        ].filter(Boolean);
        
        // If no origin header sent (same-origin or special case), allow first origin
        if (!origin) {
          console.log("CORS: No origin header, using default");
          return allowedOrigins[0] ?? "https://now-spinning.rickroche.com";
        }
        
        const isAllowed = allowedOrigins.includes(origin);
        console.log("CORS check:", {
          requestOrigin: origin,
          allowedOrigins,
          allowed: isAllowed,
        });
        
        return isAllowed ? origin : allowedOrigins[0] ?? "https://now-spinning.rickroche.com";
      } catch (err) {
        console.error("CORS origin selection error:", err);
        return "https://now-spinning.rickroche.com";
      }
    },
    credentials: true,
  })
);

// API routes
app.route("/api", health);
app.route("/api/auth", authRoutes);
app.route("/api/discogs", discogsRoutes);
app.route("/api/session", sessionRoutes);

// Error handling middleware - catches unhandled errors
app.onError((err, c) => {
  console.error("Worker error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
    500
  );
});

export default app;

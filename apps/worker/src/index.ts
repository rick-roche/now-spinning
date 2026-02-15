import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";

const app = new Hono();

// CORS middleware (allow same-origin in dev, configure for HTTPS in prod)
app.use(
  "*",
  cors({
    origin: (origin) => origin, // Accept all origins in dev; tighten for prod
    credentials: true,
  })
);

// API routes
app.route("/api", health);
app.route("/api/auth", authRoutes);

export default app;

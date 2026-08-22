import { Hono } from "hono";
import type { AppEnvironment } from "../types.js";

const health = new Hono<{ Bindings: AppEnvironment }>();

/**
 * GET /api/health
 * Returns service health status.
 */
health.get("/health", (c) => {
  const devMode = c.env.devMode;
  return c.json({
    status: "ok",
    timestamp: Date.now(),
    devMode,
  });
});

export { health };

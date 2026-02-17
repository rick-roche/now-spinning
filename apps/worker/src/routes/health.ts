import { Hono } from "hono";
import type { CloudflareBinding } from "../types.js";

const health = new Hono<{ Bindings: CloudflareBinding }>();

/**
 * GET /api/health
 * Returns service health status.
 */
health.get("/health", (c) => {
  const devMode = c.env.DEV_MODE === "true";
  return c.json({
    status: "ok",
    timestamp: Date.now(),
    devMode,
  });
});

export { health };

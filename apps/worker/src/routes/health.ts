import { Hono } from "hono";

const health = new Hono();

/**
 * GET /api/health
 * Returns service health status.
 */
health.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: Date.now(),
  });
});

export { health };

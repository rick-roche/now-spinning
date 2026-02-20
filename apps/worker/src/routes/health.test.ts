import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { CloudflareBinding } from "../types";
import { health } from "./health";

describe("Health Route", () => {
  // Create a test app with mocked bindings
  function createTestApp() {
    const mockEnv: CloudflareBinding = {
      NOW_SPINNING_KV: {} as unknown as KVNamespace,
      DEV_MODE: "true",
    } as CloudflareBinding;

    return new Hono<{ Bindings: CloudflareBinding }>()
      .use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      })
      .route("/api", health);
  }

  it("GET /api/health should return ok status", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost:8787/api/health", {
        method: "GET",
      })
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("devMode");

    // Timestamp should be a recent number (within last second)
    const timeDiff = Date.now() - (body.timestamp as number);
    expect(timeDiff).toBeLessThan(1000);
  });

  it("GET /api/health should include devMode flag", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost:8787/api/health", {
        method: "GET",
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.devMode).toBe("boolean");
    expect(body.devMode).toBe(true);
  });

  it("GET /api/health should set correct content-type", async () => {
    const app = createTestApp();

    const response = await app.request(
      new Request("http://localhost:8787/api/health", {
        method: "GET",
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { setSessionCookie } from "./auth.js";
import type { AppEnvironment } from "../types.js";

function environment(publicAppOrigin: string): AppEnvironment {
  return { publicAppOrigin } as AppEnvironment;
}

describe("session cookies", () => {
  it("uses the configured external HTTPS origin behind a reverse proxy", async () => {
    const app = new Hono<{ Bindings: AppEnvironment }>();
    app.get("/", (c) => {
      setSessionCookie(c, "session-id");
      return c.text("ok");
    });

    const response = await app.fetch(new Request("http://internal/"), environment("https://public.example"));
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("does not mark local HTTP cookies as Secure", async () => {
    const app = new Hono<{ Bindings: AppEnvironment }>();
    app.get("/", (c) => {
      setSessionCookie(c, "session-id");
      return c.text("ok");
    });

    const response = await app.fetch(new Request("http://localhost/"), environment("http://localhost:5173"));
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});

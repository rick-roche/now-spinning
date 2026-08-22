import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "./app.js";
import type { AppEnvironment } from "./types.js";

const staticRoots: string[] = [];
afterEach(() => { for (const root of staticRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function environment(): AppEnvironment {
  return {
    port: 3000,
    databasePath: "/tmp/test.sqlite",
    tokenEncryptionKey: Buffer.alloc(32, 7),
    publicAppOrigin: "http://localhost:5173",
    lastfmCallbackUrl: "http://localhost:3000/api/auth/lastfm/callback",
    discogsCallbackUrl: "http://localhost:3000/api/auth/discogs/callback",
    allowedOrigins: [],
    devMode: true,
    staticRoot: "/nonexistent",
    NOW_SPINNING_STORAGE: {} as AppEnvironment["NOW_SPINNING_STORAGE"],
    scheduler: {} as AppEnvironment["scheduler"],
  };
}

describe("application", () => {
  it("keeps unknown API requests separate from the SPA", async () => {
    const response = await createApp(environment()).request("http://localhost/api/missing");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  it("treats /api and malformed paths as safe API/404 responses", async () => {
    const app = createApp(environment());
    const apiResponse = await app.request("http://localhost/api");
    const malformedResponse = await app.request("http://localhost/%25%25%25");
    expect(apiResponse.status).toBe(404);
    expect(apiResponse.headers.get("content-type")).toContain("application/json");
    expect(malformedResponse.status).toBe(404);
  });

  it("serves safe filenames containing dots without allowing traversal", async () => {
    const staticRoot = join(tmpdir(), `now-spinning-static-${crypto.randomUUID()}`);
    staticRoots.push(staticRoot);
    mkdirSync(staticRoot, { recursive: true });
    writeFileSync(join(staticRoot, "version..json"), "safe");
    writeFileSync(join(staticRoot, "robots"), "plain");
    writeFileSync(join(staticRoot, "index.html"), "shell");
    const app = createApp({ ...environment(), staticRoot });

    const safeResponse = await app.request("http://localhost/version..json");
    const extensionlessResponse = await app.request("http://localhost/robots");
    const traversalResponse = await app.request("http://localhost/%2e%2e/%2e%2e/etc/passwd");
    expect(await safeResponse.text()).toBe("safe");
    expect(await extensionlessResponse.text()).toBe("plain");
    expect(extensionlessResponse.headers.get("content-type")).toContain("application/octet-stream");
    expect(await traversalResponse.text()).toBe("shell");
  });
});

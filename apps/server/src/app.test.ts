import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { AppEnvironment } from "./types.js";

function environment(): AppEnvironment {
  return {
    port: 3000,
    databasePath: "/tmp/test.sqlite",
    publicAppOrigin: "http://localhost:5173",
    lastfmCallbackUrl: "http://localhost:3000/api/auth/lastfm/callback",
    discogsCallbackUrl: "http://localhost:3000/api/auth/discogs/callback",
    allowedOrigins: [],
    devMode: true,
    staticRoot: "/nonexistent",
    NOW_SPINNING_STORAGE: {} as AppEnvironment["NOW_SPINNING_STORAGE"],
    scheduler: {} as AppEnvironment["scheduler"],
    PUBLIC_APP_ORIGIN: "http://localhost:5173",
    LASTFM_CALLBACK_URL: "http://localhost:3000/api/auth/lastfm/callback",
    DISCOGS_CALLBACK_URL: "http://localhost:3000/api/auth/discogs/callback",
    DEV_MODE: "true",
  };
}

describe("application", () => {
  it("keeps unknown API requests separate from the SPA", async () => {
    const response = await createApp(environment()).request("http://localhost/api/missing");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

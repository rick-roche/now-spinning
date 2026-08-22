import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const key = Buffer.alloc(32, 7).toString("base64");

describe("loadConfig", () => {
  it("loads development defaults with an encryption key", () => {
    const config = loadConfig({ NODE_ENV: "development", TOKEN_ENCRYPTION_KEY: key });
    expect(config.publicAppOrigin).toBe("http://localhost:5173");
    expect(config.tokenEncryptionKey).toHaveLength(32);
  });

  it("requires production origins, callbacks, and encryption key", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("PUBLIC_APP_ORIGIN is required");
    expect(() => loadConfig({
      NODE_ENV: "production",
      PUBLIC_APP_ORIGIN: "https://example.com",
      LASTFM_CALLBACK_URL: "https://example.com/lastfm",
      DISCOGS_CALLBACK_URL: "https://example.com/discogs",
    })).toThrow("TOKEN_ENCRYPTION_KEY is required");
  });

  it("rejects malformed encryption keys", () => {
    expect(() => loadConfig({ TOKEN_ENCRYPTION_KEY: "invalid" })).toThrow("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  });
});

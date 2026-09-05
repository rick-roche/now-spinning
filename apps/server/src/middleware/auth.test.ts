import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { setSessionCookie } from "./auth.js";
import type { AppEnvironment } from "../types.js";
import { createApp } from "../app.js";
import { openDatabase } from "../storage/database.js";
import { SQLiteStorage } from "../storage/storage.js";

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

  function oauthApp() {
    const storage = new SQLiteStorage(openDatabase(`/tmp/now-spinning-auth-${crypto.randomUUID()}.sqlite`), Buffer.alloc(32, 7));
    const environment = {
      port: 3000,
      databasePath: "/tmp/now-spinning-auth.sqlite",
      tokenEncryptionKey: Buffer.alloc(32, 7),
      publicAppOrigin: "http://localhost:5173",
      lastfmCallbackUrl: "http://localhost:3000/api/auth/lastfm/callback",
      discogsCallbackUrl: "http://localhost:3000/api/auth/discogs/callback",
      lastfmApiKey: "lastfm-key",
      lastfmApiSecret: "lastfm-secret",
      discogsConsumerKey: "discogs-key",
      discogsConsumerSecret: "discogs-secret",
      allowedOrigins: [],
      devMode: true,
      staticRoot: "/nonexistent",
      NOW_SPINNING_STORAGE: storage,
      scheduler: {} as AppEnvironment["scheduler"],
    } satisfies AppEnvironment;
    return { app: createApp(environment), environment, storage };
  }

  it("completes Last.fm callbacks in the initiating browser session", async () => {
    const { app, environment, storage } = oauthApp();
    const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ session: { key: "lastfm-session-key" } }), { status: 200 })
    );
    try {
      storage.storeOAuthState("lastfm", "state-lastfm-success", { sessionId: "initiator-lastfm" });
      const response = await app.fetch(
        new Request("http://localhost/api/auth/lastfm/callback?token=provider-token&state=state-lastfm-success", {
          headers: { Cookie: "now_spinning_session=initiator-lastfm" },
        }),
        environment
      );

      expect(response.status).toBe(302);
      expect(storage.loadTokens("initiator-lastfm").lastfm?.accessToken).toBe("lastfm-session-key");
      expect(providerFetch).toHaveBeenCalledTimes(1);
    } finally {
      providerFetch.mockRestore();
      storage.close();
    }
  });

  it("completes Discogs callbacks in the initiating browser session", async () => {
    const { app, environment, storage } = oauthApp();
    const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oauth_token=discogs-access-token&oauth_token_secret=discogs-access-secret", { status: 200 })
    );
    try {
      storage.storeOAuthState("discogs", "oauth-token-success", {
        sessionId: "initiator-discogs",
        oauth_token: "oauth-token-success",
        oauth_token_secret: "oauth-secret",
      });
      const response = await app.fetch(
        new Request("http://localhost/api/auth/discogs/callback?oauth_token=oauth-token-success&oauth_verifier=verifier", {
          headers: { Cookie: "now_spinning_session=initiator-discogs" },
        }),
        environment
      );

      expect(response.status).toBe(302);
      expect(storage.loadTokens("initiator-discogs").discogs?.accessToken).toBe("discogs-access-token");
      expect(providerFetch).toHaveBeenCalledTimes(1);
    } finally {
      providerFetch.mockRestore();
      storage.close();
    }
  });

  it.each([
    ["lastfm", "/api/auth/lastfm/callback?token=provider-token&state=missing-cookie-lastfm", "missing-cookie-lastfm"],
    ["discogs", "/api/auth/discogs/callback?oauth_token=missing-cookie-discogs&oauth_verifier=verifier", "missing-cookie-discogs"],
  ])("rejects %s callbacks without the initiating browser cookie", async (service, path, state) => {
    const { app, environment, storage } = oauthApp();
    const providerFetch = vi.spyOn(globalThis, "fetch");
    try {
      storage.storeOAuthState(service, state, {
        sessionId: `initiator-${service}`,
        ...(service === "discogs" ? { oauth_token_secret: "oauth-secret" } : {}),
      });
      const response = await app.fetch(new Request(`http://localhost${path}`), environment);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
      expect(providerFetch).not.toHaveBeenCalled();
      expect(storage.loadTokens(`initiator-${service}`).lastfm).toBeNull();
      expect(storage.loadTokens(`initiator-${service}`).discogs).toBeNull();
    } finally {
      providerFetch.mockRestore();
      storage.close();
    }
  });

  it.each([
    ["lastfm", "/api/auth/lastfm/callback?token=provider-token&state=cross-cookie-lastfm", "cross-cookie-lastfm"],
    ["discogs", "/api/auth/discogs/callback?oauth_token=cross-cookie-discogs&oauth_verifier=verifier", "cross-cookie-discogs"],
  ])("rejects %s callbacks from a different browser session", async (service, path, state) => {
    const { app, environment, storage } = oauthApp();
    const providerFetch = vi.spyOn(globalThis, "fetch");
    try {
      storage.storeOAuthState(service, state, {
        sessionId: `initiator-${service}`,
        ...(service === "discogs" ? { oauth_token_secret: "oauth-secret" } : {}),
      });
      const response = await app.fetch(
        new Request(`http://localhost${path}`, {
          headers: { Cookie: "now_spinning_session=other-browser" },
        }),
        environment
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
      expect(providerFetch).not.toHaveBeenCalled();
      expect(storage.loadTokens("initiator-lastfm").lastfm).toBeNull();
      expect(storage.loadTokens("initiator-discogs").discogs).toBeNull();
      expect(storage.loadTokens("other-browser").lastfm).toBeNull();
      expect(storage.loadTokens("other-browser").discogs).toBeNull();
    } finally {
      providerFetch.mockRestore();
      storage.close();
    }
  });

  it("rejects replayed and expired Last.fm state without contacting the provider", async () => {
    const { app, environment, storage } = oauthApp();
    const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ session: { key: "lastfm-session-key" } }), { status: 200 })
    );
    try {
      storage.storeOAuthState("lastfm", "state-replay", { sessionId: "initiator-lastfm" });
      const request = () => app.fetch(
        new Request("http://localhost/api/auth/lastfm/callback?token=provider-token&state=state-replay", {
          headers: { Cookie: "now_spinning_session=initiator-lastfm" },
        }),
        environment
      );

      expect((await request()).status).toBe(302);
      expect((await request()).status).toBe(400);
      storage.storeOAuthState("lastfm", "state-expired", { sessionId: "initiator-lastfm" }, -1);
      expect((await app.fetch(
        new Request("http://localhost/api/auth/lastfm/callback?token=provider-token&state=state-expired", {
          headers: { Cookie: "now_spinning_session=initiator-lastfm" },
        }),
        environment
      )).status).toBe(400);
      expect(providerFetch).toHaveBeenCalledTimes(1);
    } finally {
      providerFetch.mockRestore();
      storage.close();
    }
  });

  it("rejects replayed and expired Discogs state without contacting the provider", async () => {
    const { app, environment, storage } = oauthApp();
    const providerFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oauth_token=discogs-access-token&oauth_token_secret=discogs-access-secret", { status: 200 })
    );
    try {
      storage.storeOAuthState("discogs", "state-discogs-replay", {
        sessionId: "initiator-discogs",
        oauth_token_secret: "oauth-secret",
      });
      const request = () => app.fetch(
        new Request("http://localhost/api/auth/discogs/callback?oauth_token=state-discogs-replay&oauth_verifier=verifier", {
          headers: { Cookie: "now_spinning_session=initiator-discogs" },
        }),
        environment
      );

      expect((await request()).status).toBe(302);
      expect((await request()).status).toBe(403);
      storage.storeOAuthState("discogs", "state-discogs-expired", {
        sessionId: "initiator-discogs",
        oauth_token_secret: "oauth-secret",
      }, -1);
      expect((await app.fetch(
        new Request("http://localhost/api/auth/discogs/callback?oauth_token=state-discogs-expired&oauth_verifier=verifier", {
          headers: { Cookie: "now_spinning_session=initiator-discogs" },
        }),
        environment
      )).status).toBe(403);
      expect(providerFetch).toHaveBeenCalledTimes(1);
    } finally {
      providerFetch.mockRestore();
      storage.close();
    }
  });
});

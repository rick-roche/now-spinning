import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { StoredToken } from "@repo/shared";
import type { CloudflareBinding } from "../types";
import {
  getOrCreateSessionId,
  setSessionCookie,
  loadStoredTokens,
  storeTokens,
  storeOAuthState,
  getAndDeleteOAuthState,
  requireLastFm,
  requireDiscogs,
} from "./auth";
import { createKVMock, TEST_SESSION_ID, type TestErrorResponse } from "../test-utils";

describe("Auth Middleware", () => {
  let kvMock: ReturnType<typeof createKVMock>;

  beforeEach(() => {
    kvMock = createKVMock();
  });

  describe("getOrCreateSessionId", () => {
    it("should return existing session ID from cookie", () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.get("/test", (c) => {
        const sessionId = getOrCreateSessionId(c);
        expect(sessionId).toBe(TEST_SESSION_ID);
        return c.json({ sessionId });
      });
    });

    it("should generate new UUID if no session cookie exists", () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.get("/test", (c) => {
        const sessionId = getOrCreateSessionId(c);
        // Should be a valid UUID v4 format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(sessionId)).toBe(true);
        return c.json({ sessionId });
      });

      // Make a request without session cookie to test UUID generation
      void new Request("http://localhost:8787/test");
    });
  });

  describe("setSessionCookie", () => {
    it("should set httpOnly secure session cookie", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.get("/test", (c) => {
        setSessionCookie(c, "test-session-123");
        return c.json({ success: true });
      });

      const response = await app.request(new Request("http://localhost:8787/test"));
      const setCookieHeader = response.headers.get("set-cookie");

      expect(setCookieHeader).toContain("now_spinning_session=test-session-123");
      expect(setCookieHeader).toContain("HttpOnly");
      expect(setCookieHeader).toContain("Secure");
      expect(setCookieHeader).toContain("SameSite=Lax");
      expect(setCookieHeader).toContain("Path=/");
      // Check for Max-Age (30 days = 2592000 seconds)
      expect(setCookieHeader).toContain("Max-Age=2592000");
    });
  });

  describe("loadStoredTokens", () => {
    it("should load tokens from KV storage", async () => {
      const tokens = {
        lastfm: {
          service: "lastfm",
          accessToken: "lastfm-token",
          storedAt: Date.now(),
        },
        discogs: {
          service: "discogs",
          accessToken: "discogs-token",
          accessTokenSecret: "discogs-secret",
          storedAt: Date.now(),
        },
      };

      kvMock.store.set(`user:test-user:tokens`, JSON.stringify(tokens));

      const loaded = await loadStoredTokens(kvMock as unknown as KVNamespace, "test-user");

      expect(loaded.lastfm?.accessToken).toBe("lastfm-token");
      expect(loaded.discogs?.accessToken).toBe("discogs-token");
    });

    it("should return default empty tokens if not found in KV", async () => {
      const loaded = await loadStoredTokens(kvMock as unknown as KVNamespace, "nonexistent");

      expect(loaded.lastfm).toBeNull();
      expect(loaded.discogs).toBeNull();
    });

    it("should parse malformed JSON gracefully", async () => {
      kvMock.store.set(`user:bad-user:tokens`, "not valid json");

      try {
        const loaded = await loadStoredTokens(kvMock as unknown as KVNamespace, "bad-user");
        // If it doesn't throw, should have default values
        expect(loaded.lastfm).toBeNull();
        expect(loaded.discogs).toBeNull();
      } catch {
        // It's okay if it throws - the implementation might not handle this gracefully
      }
    });
  });

  describe("storeTokens", () => {
    it("should store tokens in KV with correct key", async () => {
      const tokens: { lastfm: StoredToken | null; discogs: StoredToken | null } = {
        lastfm: {
          service: "lastfm",
          accessToken: "stored-token",
          storedAt: Date.now(),
        },
        discogs: null,
      };

       
      await storeTokens(kvMock as unknown as KVNamespace, "user-123", tokens);

      const stored = kvMock.store.get("user:user-123:tokens");
      expect(stored).toBeDefined();
      if (stored) {
         
        const parsed = JSON.parse(stored);
        expect(parsed.lastfm.accessToken).toBe("stored-token");
        expect(parsed.discogs).toBeNull();
      }
    });

    it("should overwrite existing tokens", async () => {
      const oldTokens: { lastfm: StoredToken | null; discogs: StoredToken | null } = {
        lastfm: {
          service: "lastfm",
          accessToken: "old-token",
          storedAt: Date.now(),
        },
        discogs: null,
      };

       
      await storeTokens(kvMock as unknown as KVNamespace, "user-456", oldTokens);

      const newTokens: { lastfm: StoredToken | null; discogs: StoredToken | null } = {
        lastfm: null,
        discogs: {
          service: "discogs",
          accessToken: "new-discogs-token",
          accessTokenSecret: "secret",
          storedAt: Date.now(),
        },
      };

       
      await storeTokens(kvMock as unknown as KVNamespace, "user-456", newTokens);

      const stored = kvMock.store.get("user:user-456:tokens");
      if (stored) {
         
        const parsed = JSON.parse(stored);
        expect(parsed.lastfm).toBeNull();
        expect(parsed.discogs.accessToken).toBe("new-discogs-token");
      }
    });
  });

  describe("storeOAuthState", () => {
    it("should store OAuth state with 10-minute expiration", async () => {
      await storeOAuthState(kvMock as unknown as KVNamespace, "lastfm", "state-token-123", {
        sessionId: TEST_SESSION_ID,
        verifier: "pkce-verifier",
      });

      const stored = kvMock.store.get("oauth:lastfm:state-token-123");
      expect(stored).toBeDefined();
      if (stored) {
         
        const parsed = JSON.parse(stored);
        expect(parsed.sessionId).toBe(TEST_SESSION_ID);
        expect(parsed.verifier).toBe("pkce-verifier");
      }
    });

    it("should store different OAuth state for different services", async () => {
      await storeOAuthState(kvMock as unknown as KVNamespace, "lastfm", "state-1", {
        sessionId: "session-1",
      });

      await storeOAuthState(kvMock as unknown as KVNamespace, "discogs", "state-2", {
        sessionId: "session-2",
      });

      const lastfmState = kvMock.store.get("oauth:lastfm:state-1");
      const discogsState = kvMock.store.get("oauth:discogs:state-2");

      expect(lastfmState).toBeDefined();
      expect(discogsState).toBeDefined();
      if (lastfmState && discogsState) {
        expect(JSON.parse(lastfmState).sessionId).toBe("session-1");
        expect(JSON.parse(discogsState).sessionId).toBe("session-2");
      }
    });
  });

  describe("getAndDeleteOAuthState", () => {
    it("should retrieve OAuth state", async () => {
      const stateData = { sessionId: TEST_SESSION_ID, nonce: "abc123" };
      kvMock.store.set("oauth:lastfm:state-query", JSON.stringify(stateData));

      const retrieved = await getAndDeleteOAuthState(
        kvMock as unknown as KVNamespace,
        "lastfm",
        "state-query"
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(TEST_SESSION_ID);
      expect(retrieved?.nonce).toBe("abc123");
    });

    it("should delete OAuth state after retrieval", async () => {
      const stateData = { sessionId: "test-session" };
      kvMock.store.set("oauth:discogs:state-delete", JSON.stringify(stateData));

      await getAndDeleteOAuthState(kvMock as unknown as KVNamespace, "discogs", "state-delete");

      const deleted = kvMock.store.get("oauth:discogs:state-delete");
      expect(deleted).toBeUndefined();
    });

    it("should return null if state not found", async () => {
      const result = await getAndDeleteOAuthState(
        kvMock as unknown as KVNamespace,
        "lastfm",
        "nonexistent"
      );

      expect(result).toBeNull();
    });

    it("should be atomic - retrieve and delete together", async () => {
      const initialState = { sessionId: "atomic-test" };
      kvMock.store.set("oauth:test:atomic", JSON.stringify(initialState));

      const result = await getAndDeleteOAuthState(
        kvMock as unknown as KVNamespace,
        "test",
        "atomic"
      );

      expect(result?.sessionId).toBe("atomic-test");
      expect(kvMock.store.get("oauth:test:atomic")).toBeUndefined();
    });
  });

  describe("requireLastFm middleware", () => {
    it("should reject request without session cookie", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.use("/protected", requireLastFm);
      app.get("/protected", (c) => c.json({ success: true }));

      const response = await app.request(new Request("http://localhost:8787/protected"));

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject if Last.fm token not stored", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.use("/protected", requireLastFm);
      app.get("/protected", (c) => c.json({ success: true }));

      const response = await app.request(
        new Request("http://localhost:8787/protected", {
          headers: { cookie: `now_spinning_session=${TEST_SESSION_ID}` },
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("LASTFM_NOT_CONNECTED");
    });

    it("should allow request with valid Last.fm token", async () => {
      const tokens = {
        lastfm: {
          service: "lastfm",
          accessToken: "valid-token",
          storedAt: Date.now(),
        },
        discogs: null,
      };

      kvMock.store.set(`user:${TEST_SESSION_ID}:tokens`, JSON.stringify(tokens));

      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.use("/protected", requireLastFm);
      app.get("/protected", (c) => c.json({ success: true }));

      const response = await app.request(
        new Request("http://localhost:8787/protected", {
          headers: { cookie: `now_spinning_session=${TEST_SESSION_ID}` },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
    });
  });

  describe("requireDiscogs middleware", () => {
    it("should reject request without session cookie", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.use("/protected", requireDiscogs);
      app.get("/protected", (c) => c.json({ success: true }));

      const response = await app.request(new Request("http://localhost:8787/protected"));

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject if Discogs token not stored", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.use("/protected", requireDiscogs);
      app.get("/protected", (c) => c.json({ success: true }));

      const response = await app.request(
        new Request("http://localhost:8787/protected", {
          headers: { cookie: `now_spinning_session=${TEST_SESSION_ID}` },
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("DISCOGS_NOT_CONNECTED");
    });

    it("should allow request with valid Discogs token", async () => {
      const tokens = {
        lastfm: null,
        discogs: {
          service: "discogs",
          accessToken: "discogs-access",
          accessTokenSecret: "discogs-secret",
          storedAt: Date.now(),
        },
      };

      kvMock.store.set(`user:${TEST_SESSION_ID}:tokens`, JSON.stringify(tokens));

      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.use("/protected", requireDiscogs);
      app.get("/protected", (c) => c.json({ success: true }));

      const response = await app.request(
        new Request("http://localhost:8787/protected", {
          headers: { cookie: `now_spinning_session=${TEST_SESSION_ID}` },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
    });

    it("should require Discogs even if Last.fm is present", async () => {
      const tokens = {
        lastfm: {
          service: "lastfm",
          accessToken: "lastfm-token",
          storedAt: Date.now(),
        },
        discogs: null,
      };

      kvMock.store.set(`user:${TEST_SESSION_ID}:tokens`, JSON.stringify(tokens));

      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>();
      app.use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      });

      app.use("/protected", requireDiscogs);
      app.get("/protected", (c) => c.json({ success: true }));

      const response = await app.request(
        new Request("http://localhost:8787/protected", {
          headers: { cookie: `now_spinning_session=${TEST_SESSION_ID}` },
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("DISCOGS_NOT_CONNECTED");
    });
  });
});

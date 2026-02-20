import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { CloudflareBinding } from "../../types";
import { discogsRoutes } from "./discogs";
import {
  createTestUserTokens,
  createKVMock,
  kvUserTokensKey,
  getTestSessionCookie,
  TEST_SESSION_ID,
  type TestErrorResponse,
} from "../../test-utils";

describe("Discogs OAuth Routes", () => {
  function createTestApp(kvMock: ReturnType<typeof createKVMock>) {
    const mockEnv: CloudflareBinding = {
      NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
      DEV_MODE: "true",
      DISCOGS_CONSUMER_KEY: "test-key",
      DISCOGS_CONSUMER_SECRET: "test-secret",
      DISCOGS_CALLBACK_URL: "http://localhost:8787/api/auth/discogs/callback",
      PUBLIC_APP_ORIGIN: "http://localhost:5173",
    } as CloudflareBinding;

    return new Hono<{ Bindings: CloudflareBinding }>()
      .use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      })
      .route("/auth/discogs", discogsRoutes);
  }

  let kvMock: ReturnType<typeof createKVMock>;

  beforeEach(() => {
    kvMock = createKVMock();
  });

  describe("POST /start", () => {
    it("should return error if Discogs consumer key not configured", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
        DISCOGS_CALLBACK_URL: "http://localhost:8787/api/auth/discogs/callback",
        PUBLIC_APP_ORIGIN: "http://localhost:5173",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>()
        .use("*", async (c, next) => {
          c.env = mockEnv;
          await next();
        })
        .route("/auth/discogs", discogsRoutes);

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/start", { method: "POST" })
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("CONFIG_ERROR");
    });

    it("should return error if Discogs callback URL not configured", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
        DISCOGS_CONSUMER_KEY: "test-key",
        DISCOGS_CONSUMER_SECRET: "test-secret",
        PUBLIC_APP_ORIGIN: "http://localhost:5173",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>()
        .use("*", async (c, next) => {
          c.env = mockEnv;
          await next();
        })
        .route("/auth/discogs", discogsRoutes);

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/start", { method: "POST" })
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("CONFIG_ERROR");
    });

    it("should return redirect URL with OAuth token after successful fetch", async () => {
      const mockRequestTokenResponse = `oauth_token=test-request-token&oauth_token_secret=test-request-secret&oauth_callback_confirmed=true`;

      const originalFetch = global.fetch;
      global.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("request_token")) {
          return new Response(mockRequestTokenResponse, {
            status: 200,
            headers: { "content-type": "application/x-www-form-urlencoded" },
          });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/auth/discogs/start", {
            method: "POST",
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body.redirectUrl).toContain("https://www.discogs.com/oauth/authorize");
        expect(body.redirectUrl).toContain("oauth_token=test-request-token");

        const storedState = kvMock.store.get(`oauth:discogs:test-request-token`);
        expect(storedState).toBeDefined();
        if (storedState) {
           
          const parsed = JSON.parse(storedState);
           
          expect(parsed.oauth_token).toBe("test-request-token");
           
          expect(parsed.oauth_token_secret).toBe("test-request-secret");
        }
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should preserve Discogs API 4xx status codes", async () => {
      const originalFetch = global.fetch;
       
      global.fetch = async () => new Response("Bad request", { status: 400 });

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/auth/discogs/start", {
            method: "POST",
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_ERROR");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should return rate-limit error when Discogs returns 429", async () => {
      const originalFetch = global.fetch;
       
      global.fetch = async () => new Response("Too many requests", { status: 429 });

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/auth/discogs/start", {
            method: "POST",
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(429);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_RATE_LIMIT");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should handle Discogs API errors (5xx)", async () => {
      const originalFetch = global.fetch;
       
      global.fetch = async () => new Response("Server error", { status: 500 });

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/auth/discogs/start", {
            method: "POST",
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(500);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_ERROR");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should handle fetch network errors", async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => {
        throw new Error("Network timeout");
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/auth/discogs/start", {
            method: "POST",
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(500);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_ERROR");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should set session cookie on successful start", async () => {
      const mockRequestTokenResponse = `oauth_token=token123&oauth_token_secret=secret123&oauth_callback_confirmed=true`;

      const originalFetch = global.fetch;
      global.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("request_token")) {
          return new Response(mockRequestTokenResponse, {
            status: 200,
            headers: { "content-type": "application/x-www-form-urlencoded" },
          });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const response = await app.request(
          new Request("http://localhost:8787/auth/discogs/start", { method: "POST" })
        );

        expect(response.status).toBe(200);
        const setCookieHeader = response.headers.get("set-cookie");
        expect(setCookieHeader).toContain("now_spinning_session");
        expect(setCookieHeader).toContain("HttpOnly");
        expect(setCookieHeader).toContain("Secure");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("GET /callback", () => {
    it("should return error if oauth_token missing", async () => {
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/callback", {
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("AUTH_DENIED");
    });

    it("should return error if oauth_verifier missing", async () => {
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/callback?oauth_token=token123", {
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("AUTH_DENIED");
    });

    it("should return error if OAuth state token invalid", async () => {
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/callback?oauth_token=unknown&oauth_verifier=verifier123", {
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("INVALID_STATE");
    });

    it("should exchange verifier for access token on successful callback", async () => {
      const stateKey = `oauth:discogs:request-token-123`;
      const stateValue = JSON.stringify({
        sessionId: TEST_SESSION_ID,
        oauth_token: "request-token-123",
        oauth_token_secret: "request-secret-123",
      });
      kvMock.store.set(stateKey, stateValue);

      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      kvMock.store.set(tokenKey, JSON.stringify(createTestUserTokens()));

      const mockAccessTokenResponse = `oauth_token=access-token-123&oauth_token_secret=access-secret-123`;

      const originalFetch = global.fetch;
      global.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("access_token")) {
          return new Response(mockAccessTokenResponse, {
            status: 200,
            headers: { "content-type": "application/x-www-form-urlencoded" },
          });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request(
            "http://localhost:8787/auth/discogs/callback?oauth_token=request-token-123&oauth_verifier=verifier-123",
            { headers: { cookie: `${name}=${value}` } }
          )
        );

        expect(response.status).toBe(302);
        const location = response.headers.get("location");
        expect(location).toContain("localhost:5173/settings");
        expect(location).toContain("auth=discogs");

        const storedTokens = kvMock.store.get(tokenKey);
        expect(storedTokens).toBeDefined();
        if (storedTokens) {
           
          const parsed = JSON.parse(storedTokens);
           
          expect(parsed.discogs.accessToken).toBe("access-token-123");
           
          expect(parsed.discogs.accessTokenSecret).toBe("access-secret-123");
        }

        const deletedState = kvMock.store.get(stateKey);
        expect(deletedState).toBeUndefined();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should return error if Discogs consumer key not configured", async () => {
      const stateKey = `oauth:discogs:request-token-456`;
      const stateValue = JSON.stringify({
        sessionId: TEST_SESSION_ID,
        oauth_token: "request-token-456",
        oauth_token_secret: "request-secret-456",
      });
      kvMock.store.set(stateKey, stateValue);

      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
        DISCOGS_CALLBACK_URL: "http://localhost:8787/api/auth/discogs/callback",
        PUBLIC_APP_ORIGIN: "http://localhost:5173",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>()
        .use("*", async (c, next) => {
          c.env = mockEnv;
          await next();
        })
        .route("/auth/discogs", discogsRoutes);

      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request(
          "http://localhost:8787/auth/discogs/callback?oauth_token=request-token-456&oauth_verifier=verifier-456",
          { headers: { cookie: `${name}=${value}` } }
        )
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("CONFIG_ERROR");
    });

    it("should preserve Discogs API errors during token exchange", async () => {
      const stateKey = `oauth:discogs:request-token-789`;
      const stateValue = JSON.stringify({
        sessionId: TEST_SESSION_ID,
        oauth_token: "request-token-789",
        oauth_token_secret: "request-secret-789",
      });
      kvMock.store.set(stateKey, stateValue);

      const originalFetch = global.fetch;
       
      global.fetch = async () => new Response("Unauthorized", { status: 401 });

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request(
            "http://localhost:8787/auth/discogs/callback?oauth_token=request-token-789&oauth_verifier=verifier-789",
            { headers: { cookie: `${name}=${value}` } }
          )
        );

        expect(response.status).toBe(401);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_ERROR");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("should set session cookie on callback", async () => {
      const stateKey = `oauth:discogs:request-token-cookie`;
      const stateValue = JSON.stringify({
        sessionId: TEST_SESSION_ID,
        oauth_token: "request-token-cookie",
        oauth_token_secret: "request-secret-cookie",
      });
      kvMock.store.set(stateKey, stateValue);
      kvMock.store.set(kvUserTokensKey(TEST_SESSION_ID), JSON.stringify(createTestUserTokens()));

      const mockAccessTokenResponse = `oauth_token=access-token&oauth_token_secret=access-secret`;

      const originalFetch = global.fetch;
      global.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("access_token")) {
          return new Response(mockAccessTokenResponse, {
            status: 200,
            headers: { "content-type": "application/x-www-form-urlencoded" },
          });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const response = await app.request(
          new Request(
            "http://localhost:8787/auth/discogs/callback?oauth_token=request-token-cookie&oauth_verifier=verifier"
          )
        );

        expect(response.status).toBe(302);
        const setCookieHeader = response.headers.get("set-cookie");
        expect(setCookieHeader).toContain("now_spinning_session");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("POST /disconnect", () => {
    it("should remove Discogs token from storage", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const initialTokens = createTestUserTokens();
      kvMock.store.set(tokenKey, JSON.stringify(initialTokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/disconnect", {
          method: "POST",
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);

      const storedTokens = kvMock.store.get(tokenKey);
      expect(storedTokens).toBeDefined();
      if (storedTokens) {
         
        const parsed = JSON.parse(storedTokens);
         
        expect(parsed.discogs).toBeNull();
      }
    });

    it("should preserve Last.fm token when disconnecting Discogs", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/disconnect", {
          method: "POST",
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(200);

      const storedTokens = kvMock.store.get(tokenKey);
      if (storedTokens) {
         
        const parsed = JSON.parse(storedTokens);
         
        expect(parsed.lastfm).toBeDefined();
         
        expect(parsed.lastfm.accessToken).toBe("test-lastfm-token-abc123");
         
        expect(parsed.discogs).toBeNull();
      }
    });

    it("should return success even if no existing tokens", async () => {
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/disconnect", {
          method: "POST",
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
    });

    it("should return JSON response with correct content-type", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      kvMock.store.set(tokenKey, JSON.stringify(createTestUserTokens()));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/discogs/disconnect", {
          method: "POST",
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.headers.get("content-type")).toContain("application/json");
    });
  });
});

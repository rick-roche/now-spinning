/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { CloudflareBinding } from "../../types";
import { lastfmRoutes } from "./lastfm";
import {
  TEST_SESSION_ID,
  createTestUserTokens,
  createKVMock,
  kvUserTokensKey,
  getTestSessionCookie,
} from "../../test-utils";

describe("Last.fm OAuth Routes", () => {
  function createTestApp(kvMock: ReturnType<typeof createKVMock>) {
    const mockEnv: CloudflareBinding = {
      NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
      DEV_MODE: "true",
      LASTFM_API_KEY: "test-api-key",
      LASTFM_CALLBACK_URL: "http://localhost:8787/api/auth/lastfm/callback",
      PUBLIC_APP_ORIGIN: "http://localhost:5173",
    } as CloudflareBinding;

    return new Hono<{ Bindings: CloudflareBinding }>()
      .use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      })
      .route("/auth/lastfm", lastfmRoutes);
  }

  describe("GET /auth/lastfm/start", () => {
    it("should return redirect URL with API key", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/lastfm/start", {
          method: "GET",
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("redirectUrl");
      expect(body.redirectUrl).toContain("https://www.last.fm/api/auth");
      expect(body.redirectUrl).toContain("api_key=test-api-key");
      // Callback URL should contain the state parameter for CSRF protection
      expect(body.redirectUrl).toContain("cb=");
      expect(body.redirectUrl).toContain("state%3D");
    });

    it("should set session cookie", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/lastfm/start", {
          method: "GET",
        })
      );

      expect(response.status).toBe(200);
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain("now_spinning_session=");
    });

    it("should return 500 if API key not configured", async () => {
      const kvMock = createKVMock();
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
        LASTFM_CALLBACK_URL: "http://localhost:8787/api/auth/lastfm/callback",
        PUBLIC_APP_ORIGIN: "http://localhost:5173",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>()
        .use("*", async (c, next) => {
          c.env = mockEnv;
          await next();
        })
        .route("/auth/lastfm", lastfmRoutes);

      const response = await app.request(
        new Request("http://localhost:8787/auth/lastfm/start", {
          method: "GET",
        })
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as Record<string, unknown>;
      expect((body as any).error?.code).toBe("CONFIG_ERROR");
    });

    it("should store OAuth state token in KV", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/lastfm/start", {
          method: "GET",
        })
      );

      expect(response.status).toBe(200);
      // State should be stored in KV with oauth:lastfm: prefix
      const storeKeys = Array.from(kvMock.store.keys());
      expect(storeKeys.some((key) => key.startsWith("oauth:lastfm:"))).toBe(true);
    });
  });

  describe("GET /auth/lastfm/callback", () => {
    it("should reject if token is missing", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request(
          "http://localhost:8787/auth/lastfm/callback?error=user_denied",
          {
            method: "GET",
          }
        )
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as Record<string, unknown>;
      expect((body as any).error?.code).toBe("AUTH_DENIED");
    });

    it("should reject if both token and error are missing", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/lastfm/callback", {
          method: "GET",
        })
      );

      expect(response.status).toBe(403);
      const body = (await response.json()) as Record<string, unknown>;
      expect((body as any).error?.code).toBe("AUTH_DENIED");
    });

    it("should reject if state token is missing", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request(
          "http://localhost:8787/auth/lastfm/callback?token=test-token",
          {
            method: "GET",
          }
        )
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect((body as any).error?.code).toBe("INVALID_STATE");
    });

    it("should reject if state token is invalid", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request(
          "http://localhost:8787/auth/lastfm/callback?token=test-token&state=invalid-state",
          {
            method: "GET",
          }
        )
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect((body as any).error?.code).toBe("INVALID_STATE");
    });
  });

  describe("POST /auth/lastfm/disconnect", () => {
    it("should remove Last.fm token", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens();
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/auth/lastfm/disconnect", {
          method: "POST",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);

      // Verify token was removed from KV
      const stored = kvMock.store.get(tokenKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        expect(parsed.lastfm).toBeNull();
      }
    });

    it("should return application/json", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/lastfm/disconnect", {
          method: "POST",
        })
      );

      expect(response.headers.get("content-type")).toContain("application/json");
    });
  });
});

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { CloudflareBinding } from "../types";
import { authRoutes } from "./auth";
import {
  createTestUserTokens,
  kvUserTokensKey,
  TEST_SESSION_ID,
  createKVMock,
  getTestSessionCookie,
} from "../test-utils";

describe("Auth Routes", () => {
  describe("GET /auth/status", () => {
    function createTestApp(kvMock: ReturnType<typeof createKVMock>) {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      return new Hono<{ Bindings: CloudflareBinding }>()
        .use("*", async (c, next) => {
          c.env = mockEnv;
          await next();
        })
        .route("/auth", authRoutes);
    }

    it("should return both services disconnected when no tokens exist", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/status", {
          method: "GET",
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toEqual({
        lastfmConnected: false,
        discogsConnected: false,
      });
    });

    it("should return only lastfm connected when only lastfm token exists", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens({ discogs: null });
      // Store tokens under sessionId as the key (which is also userId in this design)
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const app = createTestApp(kvMock);

      const { name, value } = getTestSessionCookie();
      const response = await app.request(
        new Request("http://localhost:8787/auth/status", {
          method: "GET",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.lastfmConnected).toBe(true);
      expect(body.discogsConnected).toBe(false);
    });

    it("should return only discogs connected when only discogs token exists", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens({ lastfm: null });
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const app = createTestApp(kvMock);

      const { name, value } = getTestSessionCookie();
      const response = await app.request(
        new Request("http://localhost:8787/auth/status", {
          method: "GET",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.lastfmConnected).toBe(false);
      expect(body.discogsConnected).toBe(true);
    });

    it("should return both services connected when both tokens exist", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens();
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const app = createTestApp(kvMock);

      const { name, value } = getTestSessionCookie();
      const response = await app.request(
        new Request("http://localhost:8787/auth/status", {
          method: "GET",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.lastfmConnected).toBe(true);
      expect(body.discogsConnected).toBe(true);
    });

    it("should set session cookie on response", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/status", {
          method: "GET",
        })
      );

      expect(response.status).toBe(200);
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain("now_spinning_session=");
    });

    it("should return application/json content type", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/auth/status", {
          method: "GET",
        })
      );

      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
    });
  });
});

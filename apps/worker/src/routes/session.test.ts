import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { CloudflareBinding } from "../types";
import { sessionRoutes } from "./session";
import {
  TEST_SESSION_ID,
  TEST_RELEASE_ID,
  createTestUserTokens,
  createKVMock,
  kvUserTokensKey,
  getTestSessionCookie,
  type TestErrorResponse,
} from "../test-utils";

describe("Session Routes", () => {
  function createTestApp(kvMock: ReturnType<typeof createKVMock>) {
    const mockEnv: CloudflareBinding = {
      NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
      DEV_MODE: "true",
      DISCOGS_CONSUMER_KEY: "test-key",
      DISCOGS_CONSUMER_SECRET: "test-secret",
      LASTFM_API_KEY: "test-key",
      LASTFM_API_SECRET: "test-secret",
    } as CloudflareBinding;

    return new Hono<{ Bindings: CloudflareBinding }>()
      .use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .route("/session", sessionRoutes as any);
  }

  describe("POST /session/start", () => {
    it("should reject if Last.fm is not connected", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/session/start", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${name}=${value}`,
          },
          body: JSON.stringify({ releaseId: TEST_RELEASE_ID }),
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("LASTFM_NOT_CONNECTED");
    });

    it("should reject request without releaseId", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens();
      kvMock.store.set(kvUserTokensKey(TEST_SESSION_ID), JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/session/start", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${name}=${value}`,
          },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject invalid releaseId format", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens();
      kvMock.store.set(kvUserTokensKey(TEST_SESSION_ID), JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/session/start", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${name}=${value}`,
          },
          body: JSON.stringify({ releaseId: "invalid-id!" }),
        })
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("INVALID_RELEASE_ID");
    });
  });

  describe("POST /session/:id/pause", () => {
    it("should reject if Last.fm is not connected", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request(`http://localhost:8787/session/${TEST_SESSION_ID}/pause`, {
          method: "POST",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("LASTFM_NOT_CONNECTED");
    });

    it("should return 404 if session does not exist", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens();
      kvMock.store.set(kvUserTokensKey(TEST_SESSION_ID), JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request(`http://localhost:8787/session/nonexistent-id/pause`, {
          method: "POST",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("SESSION_NOT_FOUND");
    });
  });

  describe("POST /session/:id/resume", () => {
    it("should reject if Last.fm is not connected", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request(`http://localhost:8787/session/${TEST_SESSION_ID}/resume`, {
          method: "POST",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("LASTFM_NOT_CONNECTED");
    });

    it("should return 404 if session does not exist", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens();
      kvMock.store.set(kvUserTokensKey(TEST_SESSION_ID), JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request(`http://localhost:8787/session/nonexistent-id/resume`, {
          method: "POST",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("SESSION_NOT_FOUND");
    });
  });

  describe("POST /session/:id/next", () => {
    it("should reject if Last.fm is not connected", async () => {
      const kvMock = createKVMock();
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request(`http://localhost:8787/session/${TEST_SESSION_ID}/next`, {
          method: "POST",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("LASTFM_NOT_CONNECTED");
    });

    it("should return 404 if session does not exist", async () => {
      const kvMock = createKVMock();
      const tokens = createTestUserTokens();
      kvMock.store.set(kvUserTokensKey(TEST_SESSION_ID), JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request(`http://localhost:8787/session/nonexistent-id/next`, {
          method: "POST",
          headers: {
            cookie: `${name}=${value}`,
          },
        })
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("SESSION_NOT_FOUND");
    });
  });
});

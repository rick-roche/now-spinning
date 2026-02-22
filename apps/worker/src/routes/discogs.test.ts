import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import type { CloudflareBinding } from "../types";
import { discogsRoutes } from "./discogs";
import {
  createTestUserTokens,
  createKVMock,
  kvUserTokensKey,
  getTestSessionCookie,
  TEST_SESSION_ID,
  type TestErrorResponse,
  type TestListResponse,
} from "../test-utils";

describe("Discogs Proxy Routes", () => {
  function createTestApp(kvMock: ReturnType<typeof createKVMock>) {
    const mockEnv: CloudflareBinding = {
      NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
      DEV_MODE: "true",
      DISCOGS_CONSUMER_KEY: "test-key",
      DISCOGS_CONSUMER_SECRET: "test-secret",
    } as CloudflareBinding;

    return new Hono<{ Bindings: CloudflareBinding }>()
      .use("*", async (c, next) => {
        c.env = mockEnv;
        await next();
      })
      .route("/discogs", discogsRoutes);
  }

  let kvMock: ReturnType<typeof createKVMock>;

  beforeEach(() => {
    kvMock = createKVMock();
  });

  describe("GET /collection", () => {
    it("should return error if Discogs not connected", async () => {
      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/discogs/collection", {
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("DISCOGS_NOT_CONNECTED");
    });

    it("should require Discogs connection for app credentials", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens({ discogs: null });
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/discogs/collection", {
          headers: { cookie: `${name}=${value}` },
        })
      );

      // Should fail auth check before getting to credentials
      expect(response.status).toBe(401);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("DISCOGS_NOT_CONNECTED");
    });

    it("should fetch collection with default pagination", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const mockIdentityResponse = { username: "testuser" };
      const mockCollectionResponse = {
        pagination: {
          page: 1,
          pages: 1,
          per_page: 25,
          items: 1,
        },
        releases: [
          {
            id: 123456,
            basic_information: {
              id: 123456,
              title: "Test Album",
              year: 2024,
              thumb: "https://example.com/image.jpg",
              artists: [{ name: "Test Artist" }],
              formats: [
                {
                  name: "Vinyl",
                  descriptions: ["LP", "Album"],
                },
              ],
            },
          },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("/oauth/identity")) {
          return new Response(JSON.stringify(mockIdentityResponse), { status: 200 });
        }
        if (urlStr.includes("/users/testuser/collection")) {
          return new Response(JSON.stringify(mockCollectionResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/discogs/collection", {
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TestListResponse;
        expect(body.page).toBe(1);
        expect(body.pages).toBe(1);
        expect(body.items.length).toBe(1);
        expect(body.items[0]!.title).toBe("Test Album");
        expect(body.items[0]!.artist).toBe("Test Artist");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should respect pagination parameters", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const capturedUrls: string[] = [];
      const mockIdentityResponse = { username: "testuser" };
      const mockCollectionResponse = {
        pagination: { page: 2, pages: 5, per_page: 10, items: 50 },
        releases: [],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        capturedUrls.push(urlStr);
        if (urlStr.includes("/oauth/identity")) {
          return new Response(JSON.stringify(mockIdentityResponse), { status: 200 });
        }
        if (urlStr.includes("/users/testuser/collection")) {
          return new Response(JSON.stringify(mockCollectionResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/discogs/collection?page=2&perPage=10", {
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(200);
        const collectionUrl = capturedUrls.find((url) => url.includes("/collection"));
        expect(collectionUrl).toContain("page=2");
        expect(collectionUrl).toContain("per_page=10");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should filter collection across all pages when query is provided", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const capturedUrls: string[] = [];
      const mockIdentityResponse = { username: "testuser" };
      const pageOneResponse = {
        pagination: { page: 1, pages: 2, per_page: 100, items: 2 },
        releases: [
          {
            id: 1,
            basic_information: {
              id: 1,
              title: "Alpha Album",
              artists: [{ name: "Artist A" }],
            },
          },
        ],
      };
      const pageTwoResponse = {
        pagination: { page: 2, pages: 2, per_page: 100, items: 2 },
        releases: [
          {
            id: 2,
            basic_information: {
              id: 2,
              title: "Beta Album",
              artists: [{ name: "Artist B" }],
            },
          },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        capturedUrls.push(urlStr);
        const parsed = new URL(urlStr);

        if (urlStr.includes("/oauth/identity")) {
          return new Response(JSON.stringify(mockIdentityResponse), { status: 200 });
        }
        if (
          urlStr.includes("/users/testuser/collection") &&
          parsed.searchParams.get("page") === "1"
        ) {
          return new Response(JSON.stringify(pageOneResponse), { status: 200 });
        }
        if (
          urlStr.includes("/users/testuser/collection") &&
          parsed.searchParams.get("page") === "2"
        ) {
          return new Response(JSON.stringify(pageTwoResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request(
            "http://localhost:8787/discogs/collection?query=beta&sortBy=title&sortDir=asc&page=1&perPage=25",
            {
              headers: { cookie: `${name}=${value}` },
            }
          )
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TestListResponse;
        expect(body.totalItems).toBe(1);
        expect(body.items.length).toBe(1);
        expect(body.items[0]!.title).toBe("Beta Album");

        const collectionCalls = capturedUrls.filter((url) => url.includes("/users/testuser/collection"));
        expect(collectionCalls.some((url) => url.includes("page=1") && url.includes("per_page=100"))).toBe(true);
        expect(collectionCalls.some((url) => url.includes("page=2") && url.includes("per_page=100"))).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should sort unfiltered collection from snapshot cache path", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const mockIdentityResponse = { username: "testuser" };
      const capturedUrls: string[] = [];
      const pageOneResponse = {
        pagination: { page: 1, pages: 2, per_page: 100, items: 2 },
        releases: [
          {
            id: 1,
            basic_information: {
              id: 1,
              title: "Zulu Album",
              artists: [{ name: "Artist Z" }],
            },
          },
        ],
      };
      const pageTwoResponse = {
        pagination: { page: 2, pages: 2, per_page: 100, items: 2 },
        releases: [
          {
            id: 2,
            basic_information: {
              id: 2,
              title: "Alpha Album",
              artists: [{ name: "Artist A" }],
            },
          },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        capturedUrls.push(urlStr);
        const parsed = new URL(urlStr);
        if (urlStr.includes("/oauth/identity")) {
          return new Response(JSON.stringify(mockIdentityResponse), { status: 200 });
        }
        if (
          urlStr.includes("/users/testuser/collection") &&
          parsed.searchParams.get("page") === "1"
        ) {
          return new Response(JSON.stringify(pageOneResponse), { status: 200 });
        }
        if (
          urlStr.includes("/users/testuser/collection") &&
          parsed.searchParams.get("page") === "2"
        ) {
          return new Response(JSON.stringify(pageTwoResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/discogs/collection?sortBy=title&sortDir=asc&perPage=5&page=1", {
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TestListResponse;
        expect(body.totalItems).toBe(2);
        expect(body.items.length).toBe(2);
        expect(body.items[0]!.title).toBe("Alpha Album");

        const collectionCalls = capturedUrls.filter((url) => url.includes("/users/testuser/collection"));
        expect(collectionCalls.some((url) => url.includes("page=1") && url.includes("per_page=100"))).toBe(true);
        expect(collectionCalls.some((url) => url.includes("page=2") && url.includes("per_page=100"))).toBe(true);
        expect(collectionCalls.some((url) => url.includes("sort=title"))).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should map default dateAdded descending sort to Discogs added sort key", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const capturedUrls: string[] = [];
      const mockIdentityResponse = { username: "testuser" };
      const mockCollectionResponse = {
        pagination: { page: 1, pages: 1, per_page: 25, items: 0 },
        releases: [],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        capturedUrls.push(urlStr);
        if (urlStr.includes("/oauth/identity")) {
          return new Response(JSON.stringify(mockIdentityResponse), { status: 200 });
        }
        if (urlStr.includes("/users/testuser/collection")) {
          return new Response(JSON.stringify(mockCollectionResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/discogs/collection?sortBy=dateAdded&sortDir=desc", {
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(200);
        const collectionUrl = capturedUrls.find((url) => url.includes("/users/testuser/collection"));
        expect(collectionUrl).toContain("sort=added");
        expect(collectionUrl).toContain("sort_order=desc");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should reject invalid collection sort parameters", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const app = createTestApp(kvMock);
      const { name, value } = getTestSessionCookie();

      const response = await app.request(
        new Request("http://localhost:8787/discogs/collection?sortBy=genre", {
          headers: { cookie: `${name}=${value}` },
        })
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("INVALID_QUERY");
    });

    it("should handle Discogs API errors", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const originalFetch = globalThis.fetch;
       
      globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        const response = await app.request(
          new Request("http://localhost:8787/discogs/collection", {
            headers: { cookie: `${name}=${value}` },
          })
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_ERROR");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should cache collection response", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      const mockIdentityResponse = { username: "testuser" };
      const mockCollectionResponse = {
        pagination: { page: 1, pages: 1, per_page: 25, items: 1 },
        releases: [
          {
            id: 123456,
            basic_information: {
              id: 123456,
              title: "Cached Album",
              year: 2024,
              thumb: null,
              artists: [{ name: "Artist" }],
            },
          },
        ],
      };

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("/oauth/identity")) {
          callCount++;
          return new Response(JSON.stringify(mockIdentityResponse), { status: 200 });
        }
        if (urlStr.includes("/users/testuser/collection")) {
          callCount++;
          return new Response(JSON.stringify(mockCollectionResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();

        // First request
        const response1 = await app.request(
          new Request("http://localhost:8787/discogs/collection", {
            headers: { cookie: `${name}=${value}` },
          })
        );
        expect(response1.status).toBe(200);
        const call1Count = callCount;

        // Second request (should use cache)
        const response2 = await app.request(
          new Request("http://localhost:8787/discogs/collection", {
            headers: { cookie: `${name}=${value}` },
          })
        );
        expect(response2.status).toBe(200);
        expect(callCount).toBe(call1Count);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("GET /search", () => {
    it("should return error if query parameter missing", async () => {
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/discogs/search")
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("INVALID_QUERY");
    });

    it("should return error if Discogs credentials not configured", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>()
        .use("*", async (c, next) => {
          c.env = mockEnv;
          await next();
        })
        .route("/discogs", discogsRoutes);

      const response = await app.request(
        new Request("http://localhost:8787/discogs/search?query=test")
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("CONFIG_ERROR");
    });

    it("should search releases with query parameter", async () => {
      const mockSearchResponse = {
        pagination: { page: 1, pages: 1, per_page: 25, items: 1 },
        results: [
          {
            id: 123,
            title: "Test Album",
            artist: "Test Artist",
            year: 2024,
            thumb: "https://example.com/thumb.jpg",
            type: "release",
            format: ["Vinyl", "LP"],
          },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("/database/search")) {
          return new Response(JSON.stringify(mockSearchResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);

        const response = await app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TestListResponse;
        expect(body.query).toBe("test");
        expect(body.items.length).toBe(1);
        expect(body.items[0]!.title).toBe("Test Album");
        expect(body.items[0]!.artist).toBe("Test Artist");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should respect pagination parameters in search", async () => {
      const capturedUrls: string[] = [];
      const mockSearchResponse = {
        pagination: { page: 3, pages: 10, per_page: 50, items: 500 },
        results: [],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        capturedUrls.push(urlStr);
        if (urlStr.includes("/database/search")) {
          return new Response(JSON.stringify(mockSearchResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);

        const response = await app.request(
          new Request("http://localhost:8787/discogs/search?query=album&page=3&perPage=50")
        );

        expect(response.status).toBe(200);
        const searchUrl = capturedUrls.find((url) => url.includes("/database/search"));
        expect(searchUrl).toContain("q=album");
        expect(searchUrl).toContain("page=3");
        expect(searchUrl).toContain("per_page=50");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should filter non-release results", async () => {
      const mockSearchResponse = {
        pagination: { page: 1, pages: 1, per_page: 25, items: 3 },
        results: [
          {
            id: 1,
            title: "Release Result",
            type: "release",
          },
          {
            id: 2,
            title: "Artist Result",
            type: "artist",
          },
          {
            id: 3,
            title: "Label Result",
            type: "label",
          },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("/database/search")) {
          return new Response(JSON.stringify(mockSearchResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);

        const response = await app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as TestListResponse;
        expect(body.items.length).toBe(1);
        expect(body.items[0]!.title).toBe("Release Result");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should send Authorization header with app credentials", async () => {
      let capturedInit: RequestInit | undefined;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | Request | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        if (urlStr.includes("/database/search")) {
          capturedInit = init;
          return new Response(
            JSON.stringify({ pagination: { page: 1, pages: 1, per_page: 25, items: 0 }, results: [] }),
            { status: 200 }
          );
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const response = await app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );
        expect(response.status).toBe(200);
        expect(capturedInit).toBeDefined();
        const headers = capturedInit?.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Discogs key=test-key, secret=test-secret");
        expect(headers["User-Agent"]).toBe("NowSpinning/0.0.1 +now-spinning.dev");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle Discogs search errors", async () => {
      const originalFetch = globalThis.fetch;
       
      globalThis.fetch = async () => new Response("Server error", { status: 500 });

      try {
        const app = createTestApp(kvMock);

        const response = await app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );

        expect(response.status).toBe(502);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_ERROR");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should cache search results", async () => {
      const mockSearchResponse = {
        pagination: { page: 1, pages: 1, per_page: 25, items: 1 },
        results: [
          {
            id: 999,
            title: "Cached Result",
            artist: "Cached Artist",
            type: "release",
          },
        ],
      };

      let callCount = 0;
      const originalFetch = globalThis.fetch;
       
      globalThis.fetch = async () => {
        callCount++;
        return new Response(JSON.stringify(mockSearchResponse), { status: 200 });
      };

      try {
        const app = createTestApp(kvMock);

        // First request
        const response1 = await app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );
        expect(response1.status).toBe(200);
        const call1Count = callCount;

        // Second request (should use cache)
        const response2 = await app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );
        expect(response2.status).toBe(200);
        expect(callCount).toBe(call1Count);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("GET /release/:id", () => {
    it("should return error if release id is not numeric", async () => {
      const app = createTestApp(kvMock);

      const response = await app.request(
        new Request("http://localhost:8787/discogs/release/invalid-id")
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("INVALID_RELEASE_ID");
    });

    it("should return error if Discogs credentials not configured", async () => {
      const mockEnv: CloudflareBinding = {
        NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
        DEV_MODE: "true",
      } as CloudflareBinding;

      const app = new Hono<{ Bindings: CloudflareBinding }>()
        .use("*", async (c, next) => {
          c.env = mockEnv;
          await next();
        })
        .route("/discogs", discogsRoutes);

      const response = await app.request(
        new Request("http://localhost:8787/discogs/release/123")
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as TestErrorResponse;
      expect(body.error.code).toBe("CONFIG_ERROR");
    });

    it("should fetch and normalize release", async () => {
      const mockReleaseResponse = {
        id: 123,
        title: "Test Album",
        year: 2024,
        artists: [{ name: "Test Artist" }],
        tracklist: [
          {
            position: "A1",
            type_: "track",
            title: "Track 1",
            duration: "3:00",
            artists: [{ name: "Track Artist", role: "performer" }],
          },
        ],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("/releases/123")) {
          return new Response(JSON.stringify(mockReleaseResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);

        const response = await app.request(
          new Request("http://localhost:8787/discogs/release/123")
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as { release: { title: string } };
        expect(body.release.title).toBe("Test Album");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should send Authorization header with app credentials", async () => {
      let capturedInit: RequestInit | undefined;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: string | Request | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        if (urlStr.includes("/releases/")) {
          capturedInit = init;
          return new Response(
            JSON.stringify({ id: 123, title: "Test Album", year: 2024, artists: [{ name: "Test Artist" }], tracklist: [] }),
            { status: 200 }
          );
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const response = await app.request(
          new Request("http://localhost:8787/discogs/release/123")
        );
        expect(response.status).toBe(200);
        expect(capturedInit).toBeDefined();
        const headers = capturedInit?.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Discogs key=test-key, secret=test-secret");
        expect(headers["User-Agent"]).toBe("NowSpinning/0.0.1 +now-spinning.dev");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle Discogs release lookup errors", async () => {
      const originalFetch = globalThis.fetch;
       
      globalThis.fetch = async () => new Response("Not found", { status: 404 });

      try {
        const app = createTestApp(kvMock);

        const response = await app.request(
          new Request("http://localhost:8787/discogs/release/999")
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_ERROR");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should cache release response", async () => {
      const mockReleaseResponse = {
        id: 456,
        title: "Cached Album",
        year: 2024,
        artists: [{ name: "Artist" }],
        tracklist: [],
      };

      let callCount = 0;
      const originalFetch = globalThis.fetch;
       
      globalThis.fetch = async () => {
        callCount++;
        return new Response(JSON.stringify(mockReleaseResponse), { status: 200 });
      };

      try {
        const app = createTestApp(kvMock);

        // First request
        const response1 = await app.request(
          new Request("http://localhost:8787/discogs/release/456")
        );
        expect(response1.status).toBe(200);
        const call1Count = callCount;

        // Second request (should use cache)
        const response2 = await app.request(
          new Request("http://localhost:8787/discogs/release/456")
        );
        expect(response2.status).toBe(200);
        expect(callCount).toBe(call1Count);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should accept numeric release ids with leading zeros", async () => {
      const mockReleaseResponse = {
        id: 123,
        title: "Album",
        year: 2024,
        artists: [],
        tracklist: [],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes("/releases/0123")) {
          return new Response(JSON.stringify(mockReleaseResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);

        const response = await app.request(
          new Request("http://localhost:8787/discogs/release/0123")
        );

        expect(response.status).toBe(200);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("429 rate limit handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should retry on 429 and succeed on second attempt (search)", async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (urlStr.includes("/database/search")) {
          callCount++;
          if (callCount === 1) {
            return new Response("", { status: 429 });
          }
          return new Response(
            JSON.stringify({ pagination: { page: 1, pages: 1, per_page: 25, items: 1 }, results: [{ id: 1, title: "Album", type: "release" }] }),
            { status: 200 }
          );
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const fetchPromise = app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );
        await vi.runAllTimersAsync();
        const response = await fetchPromise;
        expect(response.status).toBe(200);
        expect(callCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should respect numeric Retry-After header and recover (search)", async () => {
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (urlStr.includes("/database/search")) {
          callCount++;
          if (callCount === 1) {
            return new Response("", { status: 429, headers: { "Retry-After": "2" } });
          }
          return new Response(
            JSON.stringify({ pagination: { page: 1, pages: 1, per_page: 25, items: 0 }, results: [] }),
            { status: 200 }
          );
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const fetchPromise = app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );
        await vi.runAllTimersAsync();
        const response = await fetchPromise;
        expect(response.status).toBe(200);
        expect(callCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should return 429 to client with DISCOGS_RATE_LIMIT after exhausting retries", async () => {
      const originalFetch = globalThis.fetch;
       
      globalThis.fetch = async () => new Response("", { status: 429 });

      try {
        const app = createTestApp(kvMock);
        const fetchPromise = app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );
        await vi.runAllTimersAsync();
        const response = await fetchPromise;
        expect(response.status).toBe(429);
        const body = (await response.json()) as TestErrorResponse;
        expect(body.error.code).toBe("DISCOGS_RATE_LIMIT");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should propagate Retry-After header to client after exhausting retries", async () => {
      const originalFetch = globalThis.fetch;
       
      globalThis.fetch = async () => new Response("", { status: 429, headers: { "Retry-After": "5" } });

      try {
        const app = createTestApp(kvMock);
        const fetchPromise = app.request(
          new Request("http://localhost:8787/discogs/search?query=test")
        );
        await vi.runAllTimersAsync();
        const response = await fetchPromise;
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("5");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should retry on 429 for /release/:id and succeed", async () => {
      let callCount = 0;
      const mockReleaseResponse = {
        id: 123,
        title: "Test Album",
        year: 2024,
        artists: [{ name: "Test Artist" }],
        tracklist: [],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (urlStr.includes("/releases/123")) {
          callCount++;
          if (callCount === 1) {
            return new Response("", { status: 429 });
          }
          return new Response(JSON.stringify(mockReleaseResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const fetchPromise = app.request(
          new Request("http://localhost:8787/discogs/release/123")
        );
        await vi.runAllTimersAsync();
        const response = await fetchPromise;
        expect(response.status).toBe(200);
        expect(callCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should retry on 429 for /collection and succeed", async () => {
      const tokenKey = kvUserTokensKey(TEST_SESSION_ID);
      const tokens = createTestUserTokens();
      tokens.discogs = {
        service: "discogs",
        accessToken: "access-token-123",
        accessTokenSecret: "secret-123",
        storedAt: Date.now(),
      };
      kvMock.store.set(tokenKey, JSON.stringify(tokens));

      let identityCallCount = 0;
      const mockIdentityResponse = { username: "testuser" };
      const mockCollectionResponse = {
        pagination: { page: 1, pages: 1, per_page: 25, items: 0 },
        releases: [],
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | Request | URL) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (urlStr.includes("/oauth/identity")) {
          identityCallCount++;
          if (identityCallCount === 1) {
            return new Response("", { status: 429 });
          }
          return new Response(JSON.stringify(mockIdentityResponse), { status: 200 });
        }
        if (urlStr.includes("/users/testuser/collection")) {
          return new Response(JSON.stringify(mockCollectionResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createTestApp(kvMock);
        const { name, value } = getTestSessionCookie();
        const fetchPromise = app.request(
          new Request("http://localhost:8787/discogs/collection", {
            headers: { cookie: `${name}=${value}` },
          })
        );
        await vi.runAllTimersAsync();
        const response = await fetchPromise;
        expect(response.status).toBe(200);
        expect(identityCallCount).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

import { vi } from "vitest";

/**
 * Test utilities for Worker routes and middleware.
 * 
 * Essential helpers for integration tests:
 * - TEST_SESSION_ID, TEST_RELEASE_ID: Standard test identifiers
 * - createTestUserTokens: Build mock OAuth tokens
 * - createKVMock: Mock Cloudflare KV namespace
 * - kvUserTokensKey: KV key generation for user tokens
 * - getTestSessionCookie: Session cookie for authenticated requests
 */

// Test constants
export const TEST_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
export const TEST_RELEASE_ID = "12345";

// KV key helpers (match the pattern used in routes)
export function kvUserTokensKey(userId: string): string {
  return `user:${userId}:tokens`;
}

// Test data builders
export function createTestUserTokens(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    lastfm: {
      service: "lastfm",
      accessToken: "test-lastfm-token-abc123",
      storedAt: now,
    },
    discogs: {
      service: "discogs",
      accessToken: "test-discogs-token-xyz789",
      accessTokenSecret: "test-discogs-secret-xyz789",
      storedAt: now,
    },
    ...overrides,
  };
}

// KV mock helpers
export function createKVMock() {
  const store = new Map<string, string>();

  return {
     
    get: vi.fn(async (key: string, format?: "json" | "text" | "arrayBuffer" | "stream") => {
      const value = store.get(key);
      if (!value) return null;

      if (format === "json") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(value);
      }
      return value;
    }),
     
    put: vi.fn(async (key: string, value: string | Record<string, unknown>) => {
      const stringValue = typeof value === "string" ? value : JSON.stringify(value);
      store.set(key, stringValue);
    }),
     
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
     
    list: vi.fn(async () => {
      return {
        keys: Array.from(store.keys()).map((name) => ({ name })),
        list_complete: true,
      };
    }),
    store,
    reset: () => {
      store.clear();
      vi.clearAllMocks();
    },
  };
}

// Helper to create a consistent test session cookie for requests
export function getTestSessionCookie(): { name: string; value: string } {
  return {
    name: "now_spinning_session",
    value: TEST_SESSION_ID,
  };
}

/** Typed shape for API error responses in tests */
export interface TestErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Typed shape for API responses with arrays */
export interface TestListResponse {
  items: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

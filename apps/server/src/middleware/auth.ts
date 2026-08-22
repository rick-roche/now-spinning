/**
 * Server auth middleware and session management.
 * Handles extracting/validating user sessions from cookies.
 */

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createAPIError, ErrorCode } from "@repo/shared";
import type { AppEnvironment } from "../types.js";
import type { SQLiteStorage, StoredTokens } from "../storage/storage.js";

const SESSION_COOKIE = "now_spinning_session";
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * Get or create a user session ID.
 * Uses httpOnly secure cookies to track the user.
 */
export function getOrCreateSessionId(c: Context<{ Bindings: AppEnvironment }>): string {
  let sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) {
    // Generate a cryptographically secure random UUID
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

/**
 * Set the session cookie.
 */
export function setSessionCookie(c: Context<{ Bindings: AppEnvironment }>, sessionId: string): void {
  try {
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: c.req.url.startsWith("https://"),
      sameSite: "Lax",
      maxAge: SESSION_COOKIE_MAX_AGE,
      path: "/",
    });
  } catch (err) {
    console.error("Failed to set session cookie:", err);
    // Don't throw - just log it. The rest of the request can continue.
  }
}

/**
 * KV storage key for user tokens.
 */
export function loadStoredTokens(storage: SQLiteStorage, userId: string): Promise<StoredTokens> { return Promise.resolve(storage.loadTokens(userId)); }

/**
 * Store tokens in KV.
 */
export function storeTokens(storage: SQLiteStorage, userId: string, tokens: StoredTokens): Promise<void> { storage.storeTokens(userId, tokens); return Promise.resolve(); }

/**
 * KV storage key for OAuth state tokens (short-lived, CSRF protection).
 */
/**
 * Store OAuth state token for CSRF protection.
 * Expires after 10 minutes.
 */
export async function storeOAuthState(
  storage: SQLiteStorage,
  service: string,
  stateToken: string,
  metadata: Record<string, string>
): Promise<void> { storage.storeOAuthState(service, stateToken, metadata); return Promise.resolve(); }

/**
 * Retrieve and delete OAuth state token.
 */
export async function getAndDeleteOAuthState(
  storage: SQLiteStorage,
  service: string,
  stateToken: string
): Promise<Record<string, string> | null> { return Promise.resolve(storage.consumeOAuthState(service, stateToken)); }

/**
 * Middleware to require Last.fm authentication.
 * Returns 401 if user doesn't have a valid Last.fm token.
 */
export async function requireLastFm(
  c: Context<{ Bindings: AppEnvironment }>,
  next: () => Promise<void>
): Promise<Response | void> {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const userId = getCookie(c, SESSION_COOKIE);
  
  if (!userId) {
    return c.json(createAPIError(ErrorCode.UNAUTHORIZED, "Session required"), 401);
  }

  const tokens = await loadStoredTokens(storage, userId);
  if (!tokens.lastfm) {
    return c.json(createAPIError(ErrorCode.LASTFM_NOT_CONNECTED, "Last.fm connection required"), 401);
  }

  await next();
}

/**
 * Worker auth middleware and session management.
 * Handles extracting/validating user sessions from cookies.
 */

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { StoredToken } from "@repo/shared";
import type { CloudflareBinding } from "../types.js";

const SESSION_COOKIE = "now_spinning_session";
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * Get or create a user session ID.
 * Uses httpOnly secure cookies to track the user.
 */
export function getOrCreateSessionId(c: Context<{ Bindings: CloudflareBinding }>): string {
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
export function setSessionCookie(c: Context<{ Bindings: CloudflareBinding }>, sessionId: string): void {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * KV storage key for user tokens.
 */
function kvKeyForTokens(userId: string): string {
  return `user:${userId}:tokens`;
}

interface StoredTokens {
  lastfm: StoredToken | null;
  discogs: StoredToken | null;
}

/**
 * Load stored tokens from KV.
 */
export async function loadStoredTokens(
  kv: KVNamespace,
  userId: string
): Promise<StoredTokens> {
  const key = kvKeyForTokens(userId);
  const data = await kv.get(key, "json");
  return (data ?? { lastfm: null, discogs: null }) as StoredTokens;
}

/**
 * Store tokens in KV.
 */
export async function storeTokens(
  kv: KVNamespace,
  userId: string,
  tokens: StoredTokens
): Promise<void> {
  const key = kvKeyForTokens(userId);
  await kv.put(key, JSON.stringify(tokens));
}

/**
 * KV storage key for OAuth state tokens (short-lived, CSRF protection).
 */
function kvKeyForOAuthState(service: string, stateToken: string): string {
  return `oauth:${service}:${stateToken}`;
}

/**
 * Store OAuth state token for CSRF protection.
 * Expires after 10 minutes.
 */
export async function storeOAuthState(
  kv: KVNamespace,
  service: string,
  stateToken: string,
  metadata: Record<string, string>
): Promise<void> {
  const key = kvKeyForOAuthState(service, stateToken);
  await kv.put(key, JSON.stringify(metadata), { expirationTtl: 600 });
}

/**
 * Retrieve and delete OAuth state token.
 */
export async function getAndDeleteOAuthState(
  kv: KVNamespace,
  service: string,
  stateToken: string
): Promise<Record<string, string> | null> {
  const key = kvKeyForOAuthState(service, stateToken);
  const data = await kv.get(key, "json");
  if (data) {
    await kv.delete(key);
  }
  return (data ?? null) as Record<string, string> | null;
}

/**
 * Middleware to require Last.fm authentication.
 * Returns 401 if user doesn't have a valid Last.fm token.
 */
export async function requireLastFm(
  c: Context<{ Bindings: CloudflareBinding }>,
  next: () => Promise<void>
): Promise<Response | void> {
  const kv = c.env.NOW_SPINNING_KV;
  const userId = getCookie(c, SESSION_COOKIE);
  
  if (!userId) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Session required" } },
      401
    );
  }

  const tokens = await loadStoredTokens(kv, userId);
  if (!tokens.lastfm) {
    return c.json(
      { error: { code: "LASTFM_NOT_CONNECTED", message: "Last.fm connection required" } },
      401
    );
  }

  await next();
}

/**
 * Middleware to require Discogs authentication.
 * Returns 401 if user doesn't have a valid Discogs token.
 * 
 * Used in Discogs API routes (will be integrated when those routes are validated).
 * knip: ignore
 */
export async function requireDiscogs(
  c: Context<{ Bindings: CloudflareBinding }>,
  next: () => Promise<void>
): Promise<Response | void> {
  const kv = c.env.NOW_SPINNING_KV;
  const userId = getCookie(c, SESSION_COOKIE);
  
  if (!userId) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Session required" } },
      401
    );
  }

  const tokens = await loadStoredTokens(kv, userId);
  if (!tokens.discogs) {
    return c.json(
      { error: { code: "DISCOGS_NOT_CONNECTED", message: "Discogs connection required" } },
      401
    );
  }

  await next();
}

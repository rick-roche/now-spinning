/**
 * Last.fm OAuth flow endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createAPIError, ErrorCode } from "@repo/shared";
import { generateRandomString } from "../../oauth.js";
import {
  getOrCreateSessionId,
  setSessionCookie,
  loadStoredTokens,
  storeTokens,
  storeOAuthState,
  getAndDeleteOAuthState,
} from "../../middleware/auth.js";
import { fetchLastFm } from "../../lastfm.js";
import type { AppEnvironment } from "../../types.js";

type HonoContext = Context<{ Bindings: AppEnvironment }>;
const LASTFM_AUTH_URL = "https://www.last.fm/api/auth";

const router = new Hono<{ Bindings: AppEnvironment }>();

router.get("/start", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const apiKey = c.env.lastfmApiKey;
  if (!apiKey || !c.env.lastfmApiSecret) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Last.fm credentials not configured"), 500);
  }

  const callbackUrl = c.env.lastfmCallbackUrl;
  if (!callbackUrl) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Last.fm callback URL not configured"), 500);
  }

  const stateToken = generateRandomString(32);
  await storeOAuthState(storage, "lastfm", stateToken, { sessionId });

  // Embed state token in callback URL for CSRF verification
  const callbackWithState = new URL(callbackUrl);
  callbackWithState.searchParams.set("state", stateToken);

  const params = new URLSearchParams({ api_key: apiKey, cb: callbackWithState.toString() });
  const redirectUrl = `${LASTFM_AUTH_URL}?${params.toString()}`;
  return c.json({ redirectUrl });
});

router.get("/callback", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const token = c.req.query("token");

  if (!token) {
    return c.json(createAPIError(ErrorCode.AUTH_DENIED, "Last.fm authorization was denied"), 403);
  }

  const currentSessionId = getCookie(c, "now_spinning_session");

  // Verify CSRF state token
  const stateToken = c.req.query("state");
  if (!stateToken) {
    return c.json(createAPIError(ErrorCode.INVALID_STATE, "Missing OAuth state parameter"), 400);
  }

  const stateData = await getAndDeleteOAuthState(storage, "lastfm", stateToken);
  if (!stateData) {
    return c.json(createAPIError(ErrorCode.INVALID_STATE, "Invalid or expired OAuth state"), 400);
  }

  const initiatingSessionId = stateData.sessionId;
  if (!currentSessionId || !initiatingSessionId || currentSessionId !== initiatingSessionId) {
    return c.json(createAPIError(ErrorCode.INVALID_STATE, "OAuth session mismatch"), 400);
  }

  setSessionCookie(c, initiatingSessionId);

  const sessionResponse = await fetchLastFm<{ session: { key: string } }>(
    "auth.getSession",
    { token },
    c.env
  );

  if (!sessionResponse.ok) {
    return c.json(createAPIError(ErrorCode.LASTFM_ERROR, "Last.fm session lookup failed"), 502);
  }

  const sessionKey = sessionResponse.data.session?.key;
  if (!sessionKey) {
    return c.json(createAPIError(ErrorCode.LASTFM_ERROR, "Last.fm session key missing"), 502);
  }

  const tokens = await loadStoredTokens(storage, initiatingSessionId);
  tokens.lastfm = { service: "lastfm", accessToken: sessionKey, storedAt: Date.now() };
  await storeTokens(storage, initiatingSessionId, tokens);

  const appOrigin = c.env.publicAppOrigin;
  const redirectUrl = new URL("/settings?auth=lastfm", appOrigin).toString();
  return c.redirect(redirectUrl);
});

router.post("/disconnect", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const sessionId = getOrCreateSessionId(c);

  const tokens = await loadStoredTokens(storage, sessionId);
  tokens.lastfm = null;
  await storeTokens(storage, sessionId, tokens);

  return c.json({ success: true });
});

export const lastfmRoutes = router;

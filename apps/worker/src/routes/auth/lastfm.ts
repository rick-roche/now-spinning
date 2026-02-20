/**
 * Last.fm OAuth flow endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { generateRandomString } from "../../oauth.js";
import {
  getOrCreateSessionId,
  setSessionCookie,
  loadStoredTokens,
  storeTokens,
  storeOAuthState,
} from "../../middleware/auth.js";
import { fetchLastFm } from "../../lastfm.js";
import type { CloudflareBinding } from "../../types.js";

type HonoContext = Context<{ Bindings: CloudflareBinding }>;
const LASTFM_AUTH_URL = "https://www.last.fm/api/auth";

const router = new Hono<{ Bindings: CloudflareBinding }>();

router.get("/start", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const apiKey = c.env.LASTFM_API_KEY;
  if (!apiKey) {
    return c.json({ error: { code: "CONFIG_ERROR", message: "Last.fm API key not configured" } }, 500);
  }

  const callbackUrl = c.env.LASTFM_CALLBACK_URL;
  if (!callbackUrl) {
    return c.json({ error: { code: "CONFIG_ERROR", message: "Last.fm callback URL not configured" } }, 500);
  }

  const stateToken = generateRandomString(32);
  await storeOAuthState(kv, "lastfm", stateToken, { sessionId });

  const params = new URLSearchParams({ api_key: apiKey, cb: callbackUrl });
  const redirectUrl = `${LASTFM_AUTH_URL}?${params.toString()}`;
  return c.json({ redirectUrl });
});

router.get("/callback", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const token = c.req.query("token");

  if (!token) {
    const error = c.req.query("error") || "User denied Last.fm authorization";
    return c.json({ error: { code: "AUTH_DENIED", message: error } }, 403);
  }

  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const sessionResponse = await fetchLastFm<{ session: { key: string } }>(
    "auth.getSession",
    { token },
    c.env
  );

  if (!sessionResponse.ok) {
    return c.json(
      { error: { code: "LASTFM_ERROR", message: sessionResponse.message } },
      502
    );
  }

  const sessionKey = sessionResponse.data.session?.key;
  if (!sessionKey) {
    return c.json(
      { error: { code: "LASTFM_ERROR", message: "Last.fm session key missing" } },
      502
    );
  }

  const tokens = await loadStoredTokens(kv, sessionId);
  tokens.lastfm = { service: "lastfm", accessToken: sessionKey, storedAt: Date.now() };
  await storeTokens(kv, sessionId, tokens);

  const appOrigin = c.env.PUBLIC_APP_ORIGIN;
  const redirectUrl = new URL("/settings?auth=lastfm", appOrigin).toString();
  return c.redirect(redirectUrl);
});

router.post("/disconnect", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);

  const tokens = await loadStoredTokens(kv, sessionId);
  tokens.lastfm = null;
  await storeTokens(kv, sessionId, tokens);

  return c.json({ success: true });
});

export const lastfmRoutes = router;

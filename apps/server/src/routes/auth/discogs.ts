/**
 * Discogs OAuth 1.0a flow endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createAPIError, ErrorCode } from "@repo/shared";
import { generateRandomString, parseFormEncoded } from "../../oauth.js";
import {
  getOrCreateSessionId,
  setSessionCookie,
  loadStoredTokens,
  storeTokens,
  getAndDeleteOAuthState,
  storeOAuthState,
} from "../../middleware/auth.js";
import type { AppEnvironment } from "../../types.js";
import { DISCOGS_API_BASE, DISCOGS_USER_AGENT } from "../../utils/discogs.js";

type HonoContext = Context<{ Bindings: AppEnvironment }>;

const DISCOGS_REQUEST_TOKEN_URL = `${DISCOGS_API_BASE}/oauth/request_token`;
const DISCOGS_AUTHORIZE_URL = "https://www.discogs.com/oauth/authorize";
const DISCOGS_ACCESS_TOKEN_URL = `${DISCOGS_API_BASE}/oauth/access_token`;

const router = new Hono<{ Bindings: AppEnvironment }>();

function discogsError(response: Response): Response {
  const retryAfter = response.headers.get("Retry-After");
  const status = response.status === 429 ? 429 : 502;
  const code = status === 429 ? ErrorCode.DISCOGS_RATE_LIMIT : ErrorCode.DISCOGS_ERROR;
  const message =
    status === 429 ? "Discogs rate limit reached. Please retry shortly." : "Discogs authorization request failed";

  const headers = new Headers({ "content-type": "application/json" });
  if (retryAfter) {
    headers.set("Retry-After", retryAfter);
  }

  return new Response(JSON.stringify(createAPIError(code, message)), { status, headers });
}

router.post("/start", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const consumerKey = c.env.discogsConsumerKey;
  const consumerSecret = c.env.discogsConsumerSecret;
  if (!consumerKey || !consumerSecret) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Discogs credentials not configured"), 500);
  }

  const callbackUrl = c.env.discogsCallbackUrl;
  if (!callbackUrl) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Discogs callback URL not configured"), 500);
  }

  const nonce = generateRandomString(32);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "PLAINTEXT",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
    oauth_callback: callbackUrl,
  };

  const signature = encodeURIComponent(consumerSecret) + "&";

  const reqParams = new URLSearchParams({ ...oauthParams, oauth_signature: signature });

  try {
    const response = await fetch(`${DISCOGS_REQUEST_TOKEN_URL}?${reqParams.toString()}`, {
      method: "POST",
      headers: { "User-Agent": DISCOGS_USER_AGENT },
    });

    console.log(
      `[Discogs] /oauth/request_token → ${response.status} | ratelimit=${response.headers.get("X-Discogs-Ratelimit")} remaining=${response.headers.get("X-Discogs-Ratelimit-Remaining")} used=${response.headers.get("X-Discogs-Ratelimit-Used")}`
    );

    if (!response.ok) {
      return discogsError(response);
    }

    const text = await response.text();
    const tokens = parseFormEncoded(text);

    const tokenStr = tokens.oauth_token ?? "";
    const secretStr = tokens.oauth_token_secret ?? "";
    await storeOAuthState(storage, "discogs", tokenStr, {
      sessionId,
      oauth_token: tokenStr,
      oauth_token_secret: secretStr,
    });

    const authorizeUrl = `${DISCOGS_AUTHORIZE_URL}?oauth_token=${encodeURIComponent(tokenStr)}`;
    return c.json({ redirectUrl: authorizeUrl });
  } catch {
    return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs authorization request failed"), 502);
  }
});

router.get("/callback", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const currentSessionId = getCookie(c, "now_spinning_session");

  const oauthToken = c.req.query("oauth_token") ?? "";
  const oauthVerifier = c.req.query("oauth_verifier") ?? "";

  if (!oauthToken || !oauthVerifier) {
    return c.json(createAPIError(ErrorCode.AUTH_DENIED, "User denied Discogs authorization"), 403);
  }

  const storedState = await getAndDeleteOAuthState(storage, "discogs", oauthToken);
  if (!storedState) {
    return c.json(createAPIError(ErrorCode.INVALID_STATE, "OAuth state token expired or invalid"), 403);
  }

  const boundSessionId = storedState.sessionId;
  if (!currentSessionId || !boundSessionId || currentSessionId !== boundSessionId) {
    return c.json(createAPIError(ErrorCode.INVALID_STATE, "OAuth session mismatch"), 400);
  }

  setSessionCookie(c, boundSessionId);

  const consumerKey = c.env.discogsConsumerKey;
  const consumerSecret = c.env.discogsConsumerSecret;

  if (!consumerKey || !consumerSecret) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Discogs credentials not configured"), 500);
  }

  const nonce = generateRandomString(32);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const accessParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "PLAINTEXT",
    oauth_timestamp: timestamp,
    oauth_token: oauthToken,
    oauth_verifier: oauthVerifier,
    oauth_version: "1.0",
  };

  const secretStr = storedState.oauth_token_secret ?? "";
  const signature = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(secretStr)}`;

  const reqParams = new URLSearchParams({ ...accessParams, oauth_signature: signature });

  try {
    const response = await fetch(`${DISCOGS_ACCESS_TOKEN_URL}?${reqParams.toString()}`, {
      method: "POST",
      headers: { "User-Agent": DISCOGS_USER_AGENT },
    });

    console.log(
      `[Discogs] /oauth/access_token → ${response.status} | ratelimit=${response.headers.get("X-Discogs-Ratelimit")} remaining=${response.headers.get("X-Discogs-Ratelimit-Remaining")} used=${response.headers.get("X-Discogs-Ratelimit-Used")}`
    );

    if (!response.ok) {
      return discogsError(response);
    }

    const text = await response.text();
    const accessToken = parseFormEncoded(text);

    const tokens = await loadStoredTokens(storage, boundSessionId);
    tokens.discogs = {
      service: "discogs",
      accessToken: accessToken.oauth_token ?? "",
      accessTokenSecret: accessToken.oauth_token_secret ?? "",
      storedAt: Date.now(),
    };
    await storeTokens(storage, boundSessionId, tokens);

    const appOrigin = c.env.publicAppOrigin;
    const redirectUrl = new URL("/settings?auth=discogs", appOrigin).toString();

    return c.redirect(redirectUrl);
  } catch {
    return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs authorization request failed"), 502);
  }
});

router.post("/disconnect", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const sessionId = getOrCreateSessionId(c);

  const tokens = await loadStoredTokens(storage, sessionId);
  tokens.discogs = null;
  await storeTokens(storage, sessionId, tokens);

  return c.json({ success: true });
});

export const discogsRoutes = router;

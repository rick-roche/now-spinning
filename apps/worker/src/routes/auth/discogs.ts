/**
 * Discogs OAuth 1.0a flow endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { generateRandomString, parseFormEncoded } from "../../oauth.js";
import {
  getOrCreateSessionId,
  setSessionCookie,
  loadStoredTokens,
  storeTokens,
  getAndDeleteOAuthState,
  storeOAuthState,
} from "../../middleware/auth.js";
import type { CloudflareBinding } from "../../types.js";

type HonoContext = Context<{ Bindings: CloudflareBinding }>;

const DISCOGS_REQUEST_TOKEN_URL = "https://api.discogs.com/oauth/request_token";
const DISCOGS_AUTHORIZE_URL = "https://www.discogs.com/oauth/authorize";
const DISCOGS_ACCESS_TOKEN_URL = "https://api.discogs.com/oauth/access_token";

const router = new Hono<{ Bindings: CloudflareBinding }>();

function discogsError(response: Response): Response {
  const retryAfter = response.headers.get("Retry-After");
  const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
  const code = status === 429 ? "DISCOGS_RATE_LIMIT" : "DISCOGS_ERROR";
  const message =
    status === 429 ? "Discogs rate limit reached. Please retry shortly." : `Discogs returned ${status}`;

  const headers = new Headers({ "content-type": "application/json" });
  if (retryAfter) {
    headers.set("Retry-After", retryAfter);
  }

  return new Response(JSON.stringify({ error: { code, message } }), { status, headers });
}

router.post("/start", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const consumerKey = c.env.DISCOGS_CONSUMER_KEY;
  if (!consumerKey) {
    return c.json({ error: { code: "CONFIG_ERROR", message: "Discogs consumer key not configured" } }, 500);
  }

  const callbackUrl = c.env.DISCOGS_CALLBACK_URL;
  if (!callbackUrl) {
    return c.json({ error: { code: "CONFIG_ERROR", message: "Discogs callback URL not configured" } }, 500);
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

  const consumerSecret = c.env.DISCOGS_CONSUMER_SECRET || "";
  const signature = encodeURIComponent(consumerSecret) + "&";

  const reqParams = new URLSearchParams({ ...oauthParams, oauth_signature: signature });

  try {
    const response = await fetch(`${DISCOGS_REQUEST_TOKEN_URL}?${reqParams.toString()}`, {
      method: "POST",
      headers: { "User-Agent": "NowSpinning/0.0.1 +now-spinning.dev" },
    });

    if (!response.ok) {
      return discogsError(response);
    }

    const text = await response.text();
    const tokens = parseFormEncoded(text);

    const tokenStr = tokens.oauth_token ?? "";
    const secretStr = tokens.oauth_token_secret ?? "";
    await storeOAuthState(kv, "discogs", tokenStr, {
      sessionId,
      oauth_token: tokenStr,
      oauth_token_secret: secretStr,
    });

    const authorizeUrl = `${DISCOGS_AUTHORIZE_URL}?oauth_token=${encodeURIComponent(tokenStr)}`;
    return c.json({ redirectUrl: authorizeUrl });
  } catch (err) {
    return c.json({ error: { code: "DISCOGS_ERROR", message: (err as Error).message } }, 500);
  }
});

router.get("/callback", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const oauthToken = c.req.query("oauth_token") ?? "";
  const oauthVerifier = c.req.query("oauth_verifier") ?? "";

  if (!oauthToken || !oauthVerifier) {
    return c.json({ error: { code: "AUTH_DENIED", message: "User denied Discogs authorization" } }, 403);
  }

  const storedState = await getAndDeleteOAuthState(kv, "discogs", oauthToken);
  if (!storedState) {
    return c.json({ error: { code: "INVALID_STATE", message: "OAuth state token expired or invalid" } }, 403);
  }

  const consumerKey = c.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = c.env.DISCOGS_CONSUMER_SECRET || "";

  if (!consumerKey) {
    return c.json({ error: { code: "CONFIG_ERROR", message: "Discogs consumer key not configured" } }, 500);
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
      headers: { "User-Agent": "NowSpinning/0.0.1 +now-spinning.dev" },
    });

    if (!response.ok) {
      return discogsError(response);
    }

    const text = await response.text();
    const accessToken = parseFormEncoded(text);

    const tokens = await loadStoredTokens(kv, sessionId);
    tokens.discogs = {
      service: "discogs",
      accessToken: accessToken.oauth_token ?? "",
      accessTokenSecret: accessToken.oauth_token_secret ?? "",
      storedAt: Date.now(),
    };
    await storeTokens(kv, sessionId, tokens);

    const appOrigin = c.env.PUBLIC_APP_ORIGIN;
    const redirectUrl = new URL("/settings?auth=discogs", appOrigin).toString();

    return c.redirect(redirectUrl);
  } catch (err) {
    return c.json({ error: { code: "DISCOGS_ERROR", message: (err as Error).message } }, 500);
  }
});

router.post("/disconnect", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);

  const tokens = await loadStoredTokens(kv, sessionId);
  tokens.discogs = null;
  await storeTokens(kv, sessionId, tokens);

  return c.json({ success: true });
});

export const discogsRoutes = router;

/**
 * Discogs proxy endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { normalizeDiscogsRelease, createAPIError, ErrorCode } from "@repo/shared";
import type {
  DiscogsCollectionResponse,
  DiscogsCollectionItem,
  DiscogsReleaseApiResponse,
  DiscogsReleaseResponse,
  DiscogsSearchItem,
  DiscogsSearchResponse,
  NormalizedRelease,
} from "@repo/shared";
import { generateRandomString } from "../oauth.js";
import {
  getOrCreateSessionId,
  setSessionCookie,
  loadStoredTokens,
} from "../middleware/auth.js";
import type { CloudflareBinding } from "../types.js";
import { DISCOGS_API_BASE, DISCOGS_USER_AGENT, getDiscogsAppCredentials, createAppAuthHeader } from "../utils/discogs.js";

type HonoContext = Context<{ Bindings: CloudflareBinding }>;
const CACHE_TTL_SECONDS = 600;
const CACHE_VERSION = "v2";

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_INITIAL_BACKOFF_MS = 500;
const RATE_LIMIT_MAX_BACKOFF_MS = 10_000;

/**
 * Parse Retry-After header value into milliseconds.
 * Accepts a numeric string (seconds) or an HTTP date string.
 * Returns null if the header is absent or unparseable.
 */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds) * 1000, RATE_LIMIT_MAX_BACKOFF_MS);
  }
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now();
    return ms > 0 ? Math.min(ms, RATE_LIMIT_MAX_BACKOFF_MS) : 0;
  }
  return null;
}

interface DiscogsIdentityResponse {
  username?: string;
}

interface DiscogsCollectionApiResponse {
  pagination?: {
    page?: number;
    pages?: number;
    per_page?: number;
    items?: number;
  };
  releases?: DiscogsCollectionRelease[];
}

interface DiscogsCollectionRelease {
  id?: number;
  date_added?: string;
  basic_information?: {
    id?: number;
    title?: string;
    year?: number;
    thumb?: string;
    cover_image?: string;
    artists?: Array<{ name?: string }>;
    formats?: Array<{ name?: string; descriptions?: string[] }>;
  };
}

interface DiscogsSearchApiResponse {
  pagination?: {
    page?: number;
    pages?: number;
    per_page?: number;
    items?: number;
  };
  results?: DiscogsSearchResult[];
}

interface DiscogsSearchResult {
  id?: number;
  title?: string;
  year?: number;
  thumb?: string;
  cover_image?: string;
  format?: string[];
  type?: string;
  artist?: string;
}

function createOAuthHeader(params: {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}): string {
  const nonce = generateRandomString(24);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `${encodeURIComponent(params.consumerSecret)}&${encodeURIComponent(
    params.accessTokenSecret
  )}`;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: params.consumerKey,
    oauth_token: params.accessToken,
    oauth_signature_method: "PLAINTEXT",
    oauth_signature: signature,
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: "1.0",
  };

  const header = Object.entries(oauthParams)
    .map(([key, value]) => {
      const encodedValue = key === "oauth_signature" ? value : encodeURIComponent(value);
      return `${key}="${encodedValue}"`;
    })
    .join(", ");

  return `OAuth ${header}`;
}

function normalizeCollectionItem(release: DiscogsCollectionRelease): DiscogsCollectionItem | null {
  const basic = release.basic_information ?? {};
  const instanceId = release.id;
  const releaseId = basic.id;
  if (!instanceId || !releaseId) {
    return null;
  }

  const artist = basic.artists?.[0]?.name ?? "Unknown Artist";
  const year = Number.isFinite(basic.year) ? (basic.year as number) : null;
  const formatStrings = (basic.formats ?? [])
    .map((format) => {
      const parts = [format.name, ...(format.descriptions ?? [])].filter(Boolean);
      return parts.join(" ").trim();
    })
    .filter((value) => value.length > 0);
  const formats = Array.from(new Set(formatStrings));

  return {
    instanceId: String(instanceId),
    releaseId: String(releaseId),
    title: basic.title ?? "Untitled",
    artist,
    year,
    thumbUrl: basic.thumb ?? basic.cover_image ?? null,
    formats,
    dateAdded: release.date_added ?? null,
  };
}

function normalizeSearchItem(result: DiscogsSearchResult): DiscogsSearchItem | null {
  if (!result.id) {
    return null;
  }

  const rawTitle = result.title?.trim() || "Untitled";
  let title = rawTitle;
  let artist = result.artist?.trim() || "Unknown Artist";

  if (!result.artist && rawTitle.includes(" - ")) {
    const [maybeArtist, ...rest] = rawTitle.split(" - ");
    if (rest.length > 0 && maybeArtist !== undefined) {
      artist = maybeArtist.trim() || artist;
      title = rest.join(" - ").trim() || title;
    }
  }

  return {
    instanceId: String(result.id),
    releaseId: String(result.id),
    title,
    artist,
    year: Number.isFinite(result.year) ? (result.year as number) : null,
    thumbUrl: result.thumb ?? result.cover_image ?? null,
    formats: result.format ?? [],
  };
}

async function fetchDiscogsJson<T>(
  url: string,
  authHeader?: string
): Promise<{ ok: true; data: T } | { ok: false; status: number; retryAfter?: string | null }> {
  const headers: Record<string, string> = {
    "User-Agent": DISCOGS_USER_AGENT,
  };

  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const urlPath = (() => { try { return new URL(url).pathname; } catch { return url; } })();

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const response = await fetch(url, { method: "GET", headers });

    console.log(
      `[Discogs] ${urlPath} → ${response.status} | ratelimit=${response.headers.get("X-Discogs-Ratelimit")} remaining=${response.headers.get("X-Discogs-Ratelimit-Remaining")} used=${response.headers.get("X-Discogs-Ratelimit-Used")} auth=${authHeader ? "yes" : "no"}${attempt > 0 ? ` attempt=${attempt + 1}` : ""}`
    );

    if (response.status !== 429) {
      if (!response.ok) {
        return { ok: false, status: response.status };
      }
      const data = (await response.json()) as T;
      return { ok: true, data };
    }

    // 429: rate limited — retry with backoff unless we've exhausted attempts
    const retryAfterHeader = response.headers.get("Retry-After");

    if (attempt >= RATE_LIMIT_MAX_RETRIES) {
      return { ok: false, status: 429, retryAfter: retryAfterHeader };
    }

    const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
    const backoffMs =
      retryAfterMs ?? Math.min(RATE_LIMIT_INITIAL_BACKOFF_MS * Math.pow(2, attempt), RATE_LIMIT_MAX_BACKOFF_MS);

    console.log(
      `[Discogs] ${urlPath} → 429 rate limited, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`
    );

    await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
  }

  // Should not be reached
  return { ok: false, status: 429 };
}

const router = new Hono<{ Bindings: CloudflareBinding }>();

router.get("/collection", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const tokens = await loadStoredTokens(kv, sessionId);
  if (!tokens.discogs || !tokens.discogs.accessTokenSecret) {
    return c.json(createAPIError(ErrorCode.DISCOGS_NOT_CONNECTED, "Discogs is not connected"), 401);
  }

  const consumerKey = c.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = c.env.DISCOGS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Discogs credentials not configured"), 500);
  }

  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    50,
    Math.max(5, Number.parseInt(c.req.query("perPage") ?? "25", 10) || 25)
  );

  const cacheKey = `discogs:collection:${CACHE_VERSION}:${sessionId}:${page}:${perPage}`;
  const cached = await kv.get<DiscogsCollectionResponse>(cacheKey, "json");
  if (cached) {
    return c.json(cached);
  }

  const authHeader = createOAuthHeader({
    consumerKey,
    consumerSecret,
    accessToken: tokens.discogs.accessToken,
    accessTokenSecret: tokens.discogs.accessTokenSecret,
  });

  const identityCacheKey = `discogs:identity:${sessionId}`;
  let identity = await kv.get<DiscogsIdentityResponse>(identityCacheKey, "json");

  if (!identity?.username) {
    const identityUrl = `${DISCOGS_API_BASE}/oauth/identity`;
    const identityResponse = await fetchDiscogsJson<DiscogsIdentityResponse>(
      identityUrl,
      authHeader
    );

    if (!identityResponse.ok) {
      if (identityResponse.status === 429) {
        if (identityResponse.retryAfter) c.header("Retry-After", identityResponse.retryAfter);
        return c.json(createAPIError(ErrorCode.DISCOGS_RATE_LIMIT, "Discogs rate limit reached. Please retry shortly."), 429);
      }
      const statusCode = identityResponse.status >= 500 ? 502 : 400;
      return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs identity lookup failed"), statusCode);
    }

    identity = identityResponse.data;
    await kv.put(identityCacheKey, JSON.stringify(identity), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }

  const username = identity.username;
  if (!username) {
    return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs username not available"), 502);
  }

  const collectionUrl = new URL(
    `${DISCOGS_API_BASE}/users/${encodeURIComponent(username)}/collection/folders/0/releases`
  );
  collectionUrl.searchParams.set("page", page.toString());
  collectionUrl.searchParams.set("per_page", perPage.toString());

  const collectionResponse = await fetchDiscogsJson<DiscogsCollectionApiResponse>(
    collectionUrl.toString(),
    authHeader
  );

  if (!collectionResponse.ok) {
    if (collectionResponse.status === 429) {
      if (collectionResponse.retryAfter) c.header("Retry-After", collectionResponse.retryAfter);
      return c.json(createAPIError(ErrorCode.DISCOGS_RATE_LIMIT, "Discogs rate limit reached. Please retry shortly."), 429);
    }
    const statusCode = collectionResponse.status >= 500 ? 502 : 400;
    return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs collection fetch failed"), statusCode);
  }

  const rawData = collectionResponse.data;
  const items = (rawData.releases ?? [])
    .map((release) => normalizeCollectionItem(release))
    .filter((item): item is DiscogsCollectionItem => item !== null);

  const response: DiscogsCollectionResponse = {
    page: rawData.pagination?.page ?? page,
    pages: rawData.pagination?.pages ?? page,
    perPage: rawData.pagination?.per_page ?? perPage,
    totalItems: rawData.pagination?.items ?? items.length,
    items,
  };

  await kv.put(cacheKey, JSON.stringify(response), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return c.json(response);
});

router.get("/search", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const query = (c.req.query("query") ?? "").trim();
  if (!query) {
    return c.json(createAPIError(ErrorCode.INVALID_QUERY, "Query is required"), 400);
  }

  const appCredentials = getDiscogsAppCredentials(c);
  if (!appCredentials) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Discogs credentials not configured"), 500);
  }

  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    50,
    Math.max(5, Number.parseInt(c.req.query("perPage") ?? "25", 10) || 25)
  );

  const cacheKey = `discogs:search:${query.toLowerCase()}:${page}:${perPage}`;
  const cached = await kv.get<DiscogsSearchResponse>(cacheKey, "json");
  if (cached) {
    return c.json(cached);
  }

  const searchUrl = new URL(`${DISCOGS_API_BASE}/database/search`);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "release");
  searchUrl.searchParams.set("page", page.toString());
  searchUrl.searchParams.set("per_page", perPage.toString());
  const searchAuthHeader = createAppAuthHeader(appCredentials.consumerKey, appCredentials.consumerSecret);

  const searchResponse = await fetchDiscogsJson<DiscogsSearchApiResponse>(searchUrl.toString(), searchAuthHeader);
  if (!searchResponse.ok) {
    if (searchResponse.status === 429) {
      if (searchResponse.retryAfter) c.header("Retry-After", searchResponse.retryAfter);
      return c.json(createAPIError(ErrorCode.DISCOGS_RATE_LIMIT, "Discogs rate limit reached. Please retry shortly."), 429);
    }
    const statusCode = searchResponse.status >= 500 ? 502 : 400;
    return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs search failed"), statusCode);
  }

  const rawData = searchResponse.data;
  const items = (rawData.results ?? [])
    .filter((result) => !result.type || result.type === "release")
    .map((result) => normalizeSearchItem(result))
    .filter((item): item is DiscogsSearchItem => item !== null);

  const response: DiscogsSearchResponse = {
    query,
    page: rawData.pagination?.page ?? page,
    pages: rawData.pagination?.pages ?? page,
    perPage: rawData.pagination?.per_page ?? perPage,
    totalItems: rawData.pagination?.items ?? items.length,
    items,
  };

  await kv.put(cacheKey, JSON.stringify(response), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return c.json(response);
});

router.get("/release/:id", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const releaseId = c.req.param("id");

  if (!/^[0-9]+$/.test(releaseId)) {
    return c.json(createAPIError(ErrorCode.INVALID_RELEASE_ID, "Release id must be numeric"), 400);
  }

  const appCredentials = getDiscogsAppCredentials(c);
  if (!appCredentials) {
    return c.json(createAPIError(ErrorCode.CONFIG_ERROR, "Discogs credentials not configured"), 500);
  }

  const cacheKey = `discogs:release:${releaseId}`;
  const cached = await kv.get<DiscogsReleaseResponse<NormalizedRelease>>(cacheKey, "json");
  if (cached) {
    return c.json(cached);
  }

  const releaseUrl = new URL(`${DISCOGS_API_BASE}/releases/${releaseId}`);
  const releaseAuthHeader = createAppAuthHeader(appCredentials.consumerKey, appCredentials.consumerSecret);

  const releaseResponse = await fetchDiscogsJson<DiscogsReleaseApiResponse>(
    releaseUrl.toString(),
    releaseAuthHeader
  );

  if (!releaseResponse.ok) {
    if (releaseResponse.status === 429) {
      if (releaseResponse.retryAfter) c.header("Retry-After", releaseResponse.retryAfter);
      return c.json(createAPIError(ErrorCode.DISCOGS_RATE_LIMIT, "Discogs rate limit reached. Please retry shortly."), 429);
    }
    const statusCode = releaseResponse.status >= 500 ? 502 : 400;
    return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs release lookup failed"), statusCode);
  }

  const normalized = normalizeDiscogsRelease(releaseResponse.data);
  const response: DiscogsReleaseResponse<NormalizedRelease> = { release: normalized };

  await kv.put(cacheKey, JSON.stringify(response), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return c.json(response);
});

export const discogsRoutes = router;

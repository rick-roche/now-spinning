/**
 * Discogs proxy endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { normalizeDiscogsRelease } from "@repo/shared";
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

type HonoContext = Context<{ Bindings: CloudflareBinding }>;

const DISCOGS_API_BASE = "https://api.discogs.com";
const DISCOGS_USER_AGENT = "NowSpinning/0.0.1 +now-spinning.dev";
const CACHE_TTL_SECONDS = 600;
const CACHE_VERSION = "v2";

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
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const headers: Record<string, string> = {
    "User-Agent": DISCOGS_USER_AGENT,
  };

  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

const router = new Hono<{ Bindings: CloudflareBinding }>();

function getDiscogsAppCredentials(
  c: HonoContext
): { consumerKey: string; consumerSecret: string } | null {
  const consumerKey = c.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = c.env.DISCOGS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    return null;
  }

  return { consumerKey, consumerSecret };
}

function applyAppAuth(url: URL, consumerKey: string, consumerSecret: string): void {
  url.searchParams.set("key", consumerKey);
  url.searchParams.set("secret", consumerSecret);
}

router.get("/collection", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const sessionId = getOrCreateSessionId(c);
  setSessionCookie(c, sessionId);

  const tokens = await loadStoredTokens(kv, sessionId);
  if (!tokens.discogs || !tokens.discogs.accessTokenSecret) {
    return c.json(
      { error: { code: "DISCOGS_NOT_CONNECTED", message: "Discogs is not connected" } },
      401
    );
  }

  const consumerKey = c.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = c.env.DISCOGS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    return c.json(
      { error: { code: "CONFIG_ERROR", message: "Discogs credentials not configured" } },
      500
    );
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
      const statusCode = identityResponse.status >= 500 ? 502 : 400;
      return c.json(
        { error: { code: "DISCOGS_ERROR", message: "Discogs identity lookup failed" } },
        statusCode
      );
    }

    identity = identityResponse.data;
    await kv.put(identityCacheKey, JSON.stringify(identity), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }

  const username = identity.username;
  if (!username) {
    return c.json(
      { error: { code: "DISCOGS_ERROR", message: "Discogs username not available" } },
      502
    );
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
    const statusCode = collectionResponse.status >= 500 ? 502 : 400;
    return c.json(
      { error: { code: "DISCOGS_ERROR", message: "Discogs collection fetch failed" } },
      statusCode
    );
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
    return c.json(
      { error: { code: "INVALID_QUERY", message: "Query is required" } },
      400
    );
  }

  const appCredentials = getDiscogsAppCredentials(c);
  if (!appCredentials) {
    return c.json(
      { error: { code: "CONFIG_ERROR", message: "Discogs credentials not configured" } },
      500
    );
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
  applyAppAuth(searchUrl, appCredentials.consumerKey, appCredentials.consumerSecret);

  const searchResponse = await fetchDiscogsJson<DiscogsSearchApiResponse>(searchUrl.toString());
  if (!searchResponse.ok) {
    const statusCode = searchResponse.status >= 500 ? 502 : 400;
    return c.json(
      { error: { code: "DISCOGS_ERROR", message: "Discogs search failed" } },
      statusCode
    );
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
    return c.json(
      { error: { code: "INVALID_RELEASE_ID", message: "Release id must be numeric" } },
      400
    );
  }

  const appCredentials = getDiscogsAppCredentials(c);
  if (!appCredentials) {
    return c.json(
      { error: { code: "CONFIG_ERROR", message: "Discogs credentials not configured" } },
      500
    );
  }

  const cacheKey = `discogs:release:${releaseId}`;
  const cached = await kv.get<DiscogsReleaseResponse<NormalizedRelease>>(cacheKey, "json");
  if (cached) {
    return c.json(cached);
  }

  const releaseUrl = new URL(`${DISCOGS_API_BASE}/releases/${releaseId}`);
  applyAppAuth(releaseUrl, appCredentials.consumerKey, appCredentials.consumerSecret);

  const releaseResponse = await fetchDiscogsJson<DiscogsReleaseApiResponse>(
    releaseUrl.toString()
  );

  if (!releaseResponse.ok) {
    const statusCode = releaseResponse.status >= 500 ? 502 : 400;
    return c.json(
      { error: { code: "DISCOGS_ERROR", message: "Discogs release lookup failed" } },
      statusCode
    );
  }

  const normalized = normalizeDiscogsRelease(releaseResponse.data);
  const response: DiscogsReleaseResponse<NormalizedRelease> = { release: normalized };

  await kv.put(cacheKey, JSON.stringify(response), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return c.json(response);
});

export const discogsRoutes = router;

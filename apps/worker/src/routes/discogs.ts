/**
 * Discogs proxy endpoints.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import {
  normalizeDiscogsRelease,
  createAPIError,
  ErrorCode,
  DiscogsCollectionQuerySchema,
} from "@repo/shared";
import type {
  DiscogsCollectionResponse,
  DiscogsCollectionItem,
  DiscogsCollectionSortDir,
  DiscogsCollectionSortField,
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
const CACHE_TTL_SECONDS = 3600;
const COLLECTION_SNAPSHOT_TTL_SECONDS = 43_200;
const CACHE_VERSION = "v3";
const COLLECTION_INDEX_PER_PAGE = 100;

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

interface DiscogsCollectionSnapshot {
  items: DiscogsCollectionItem[];
}

type SnapshotLoadResult =
  | { ok: true; snapshot: DiscogsCollectionSnapshot }
  | { ok: false; status: number; retryAfter?: string | null };

const snapshotBuildInFlight = new Map<string, Promise<SnapshotLoadResult>>();

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

function compareCollectionItems(
  a: DiscogsCollectionItem,
  b: DiscogsCollectionItem,
  sortBy: DiscogsCollectionSortField
): number {
  if (sortBy === "title") {
    return a.title.localeCompare(b.title);
  }
  if (sortBy === "artist") {
    return a.artist.localeCompare(b.artist);
  }
  if (sortBy === "year") {
    return (a.year ?? 0) - (b.year ?? 0);
  }

  const aTimestamp = a.dateAdded ? Date.parse(a.dateAdded) : NaN;
  const bTimestamp = b.dateAdded ? Date.parse(b.dateAdded) : NaN;
  const aValid = Number.isFinite(aTimestamp);
  const bValid = Number.isFinite(bTimestamp);

  if (aValid && bValid) {
    return aTimestamp - bTimestamp;
  }
  if (aValid && !bValid) {
    return 1;
  }
  if (!aValid && bValid) {
    return -1;
  }
  return 0;
}

function sortCollectionItems(
  items: DiscogsCollectionItem[],
  sortBy: DiscogsCollectionSortField,
  sortDir: DiscogsCollectionSortDir
): DiscogsCollectionItem[] {
  return [...items].sort((a, b) => {
    const cmp = compareCollectionItems(a, b, sortBy);
    return sortDir === "asc" ? cmp : -cmp;
  });
}

function filterCollectionItems(items: DiscogsCollectionItem[], query: string): DiscogsCollectionItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.artist.toLowerCase().includes(normalizedQuery)
  );
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

function createCollectionUrl(
  username: string,
  page: number,
  perPage: number,
  sortBy?: DiscogsCollectionSortField,
  sortDir?: DiscogsCollectionSortDir
): string {
  const collectionUrl = new URL(
    `${DISCOGS_API_BASE}/users/${encodeURIComponent(username)}/collection/folders/0/releases`
  );
  collectionUrl.searchParams.set("page", page.toString());
  collectionUrl.searchParams.set("per_page", perPage.toString());

  if (sortBy && sortDir) {
    const upstreamSortBy: Record<DiscogsCollectionSortField, string> = {
      dateAdded: "added",
      title: "title",
      artist: "artist",
      year: "year",
    };
    collectionUrl.searchParams.set("sort", upstreamSortBy[sortBy]);
    collectionUrl.searchParams.set("sort_order", sortDir);
  }

  return collectionUrl.toString();
}

async function loadCollectionSnapshot(params: {
  kv: KVNamespace;
  sessionId: string;
  username: string;
  authHeader: string;
}): Promise<SnapshotLoadResult> {
  const { kv, sessionId, username, authHeader } = params;
  const snapshotCacheKey = `discogs:collection:index:${CACHE_VERSION}:${sessionId}`;
  const cachedSnapshot = await kv.get<DiscogsCollectionSnapshot>(snapshotCacheKey, "json");
  if (cachedSnapshot?.items) {
    return { ok: true, snapshot: cachedSnapshot };
  }

  const inFlight = snapshotBuildInFlight.get(snapshotCacheKey);
  if (inFlight) {
    return inFlight;
  }

  const buildPromise: Promise<SnapshotLoadResult> = (async () => {
    const snapshotItems: DiscogsCollectionItem[] = [];
    let nextPage = 1;
    let totalPages = 1;

    while (nextPage <= totalPages) {
      const pageUrl = createCollectionUrl(username, nextPage, COLLECTION_INDEX_PER_PAGE);
      const pageResponse = await fetchDiscogsJson<DiscogsCollectionApiResponse>(pageUrl, authHeader);
      if (!pageResponse.ok) {
        return pageResponse;
      }

      const pageData = pageResponse.data;
      const pageItems = (pageData.releases ?? [])
        .map((release) => normalizeCollectionItem(release))
        .filter((item): item is DiscogsCollectionItem => item !== null);

      snapshotItems.push(...pageItems);
      totalPages = Math.max(1, pageData.pagination?.pages ?? totalPages);
      nextPage += 1;
    }

    const snapshot: DiscogsCollectionSnapshot = { items: snapshotItems };
    await kv.put(snapshotCacheKey, JSON.stringify(snapshot), {
      expirationTtl: COLLECTION_SNAPSHOT_TTL_SECONDS,
    });

    return { ok: true, snapshot };
  })();

  snapshotBuildInFlight.set(snapshotCacheKey, buildPromise);
  try {
    return await buildPromise;
  } finally {
    snapshotBuildInFlight.delete(snapshotCacheKey);
  }
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

  const parsedQuery = DiscogsCollectionQuerySchema.safeParse({
    page: c.req.query("page"),
    perPage: c.req.query("perPage"),
    query: c.req.query("query"),
    sortBy: c.req.query("sortBy"),
    sortDir: c.req.query("sortDir"),
  });
  if (!parsedQuery.success) {
    return c.json(createAPIError(ErrorCode.INVALID_QUERY, "Invalid collection query parameters"), 400);
  }
  const { page, perPage, query, sortBy, sortDir } = parsedQuery.data;

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

  const normalizedQuery = query.toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const useDiscogsDirectPath = !hasQuery && sortBy === "dateAdded" && sortDir === "desc";

  if (useDiscogsDirectPath) {
    const cacheKey = `discogs:collection:${CACHE_VERSION}:${sessionId}:${page}:${perPage}:${sortBy}:${sortDir}`;
    const cached = await kv.get<DiscogsCollectionResponse>(cacheKey, "json");
    if (cached) {
      return c.json(cached);
    }

    const collectionResponse = await fetchDiscogsJson<DiscogsCollectionApiResponse>(
      createCollectionUrl(username, page, perPage, sortBy, sortDir),
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
  }

  const searchCacheKey =
    `discogs:collection:search:${CACHE_VERSION}:${sessionId}:${page}:${perPage}:` +
    `${sortBy}:${sortDir}:${normalizedQuery}`;
  const cachedSearch = await kv.get<DiscogsCollectionResponse>(searchCacheKey, "json");
  if (cachedSearch) {
    return c.json(cachedSearch);
  }

  const snapshotResult = await loadCollectionSnapshot({
    kv,
    sessionId,
    username,
    authHeader,
  });
  if (!snapshotResult.ok) {
    if (snapshotResult.status === 429) {
      if (snapshotResult.retryAfter) c.header("Retry-After", snapshotResult.retryAfter);
      return c.json(createAPIError(ErrorCode.DISCOGS_RATE_LIMIT, "Discogs rate limit reached. Please retry shortly."), 429);
    }
    const statusCode = snapshotResult.status >= 500 ? 502 : 400;
    return c.json(createAPIError(ErrorCode.DISCOGS_ERROR, "Discogs collection fetch failed"), statusCode);
  }

  const filteredItems = filterCollectionItems(snapshotResult.snapshot.items, query);
  const sortedItems = sortCollectionItems(filteredItems, sortBy, sortDir);
  const totalItems = sortedItems.length;
  const pages = Math.max(1, Math.ceil(totalItems / perPage));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * perPage;
  const items = sortedItems.slice(start, start + perPage);

  const response: DiscogsCollectionResponse = {
    page: currentPage,
    pages,
    perPage,
    totalItems,
    items,
  };

  await kv.put(searchCacheKey, JSON.stringify(response), {
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

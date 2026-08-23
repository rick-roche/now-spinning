import {
  mergeMissingTrackDurations,
  normalizeDiscogsRelease,
  type DiscogsReleaseApiResponse,
  type NormalizedRelease,
} from "@repo/shared";
import type { AppEnvironment } from "../types.js";
import type { SQLiteStorage } from "../storage/storage.js";
import { createAppAuthHeader, DISCOGS_API_BASE, DISCOGS_USER_AGENT } from "./discogs.js";

const CACHE_TTL_SECONDS = 3600;

export type DiscogsReleaseLoadResult =
  | { ok: true; release: NormalizedRelease }
  | { ok: false; status: 404 | 429 | 500 | 502; retryAfter?: string | null };

async function fetchRelease(
  environment: AppEnvironment,
  path: string
): Promise<{ ok: true; data: DiscogsReleaseApiResponse } | { ok: false; status: 404 | 429 | 500 | 502; retryAfter?: string | null }> {
  const { discogsConsumerKey, discogsConsumerSecret } = environment;
  if (!discogsConsumerKey || !discogsConsumerSecret) return { ok: false, status: 500 };

  let response: Response;
  try {
    response = await fetch(`${DISCOGS_API_BASE}${path}`, {
      headers: { "User-Agent": DISCOGS_USER_AGENT, Authorization: createAppAuthHeader(discogsConsumerKey, discogsConsumerSecret) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, status: 502 };
  }
  if (!response.ok) {
    if (response.status === 429) return { ok: false, status: 429, retryAfter: response.headers.get("Retry-After") };
    if (response.status === 404) return { ok: false, status: 404 };
    return { ok: false, status: 502 };
  }

  let data: unknown;
  try { data = await response.json(); } catch { return { ok: false, status: 502 }; }
  if (!data || typeof data !== "object") return { ok: false, status: 502 };
  return { ok: true, data };
}

/** Loads one concrete release and fills its missing durations from its master. */
export async function loadNormalizedDiscogsRelease(
  environment: AppEnvironment,
  storage: SQLiteStorage,
  releaseId: string
): Promise<DiscogsReleaseLoadResult> {
  const cacheKey = `discogs:release:enriched:${releaseId}`;
  const cached = storage.getCache<NormalizedRelease>(cacheKey);
  if (cached) return { ok: true, release: cached };

  const releaseResponse = await fetchRelease(environment, `/releases/${encodeURIComponent(releaseId)}`);
  if (!releaseResponse.ok) return releaseResponse;
  let release = normalizeDiscogsRelease(releaseResponse.data);

  if (release.masterId && release.tracks.some((track) => track.durationSec === null)) {
    const masterCacheKey = `discogs:master:${release.masterId}`;
    let master = storage.getCache<NormalizedRelease>(masterCacheKey);
    if (!master) {
      const masterResponse = await fetchRelease(environment, `/masters/${encodeURIComponent(release.masterId)}`);
      if (masterResponse.ok) {
        master = normalizeDiscogsRelease(masterResponse.data);
        storage.setCache(masterCacheKey, master, CACHE_TTL_SECONDS);
      }
    }
    if (master) release = mergeMissingTrackDurations(release, master);
  }

  storage.setCache(cacheKey, release, CACHE_TTL_SECONDS);
  return { ok: true, release };
}

import md5Module from "js-md5";
import type { AppEnvironment } from "./types.js";
import type { RecentScrobble } from "@repo/shared";

// js-md5 exports a function as the default export, handle both ESM and CJS
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
const rawMd5 = (md5Module as any).default || md5Module;

// Type guard and cast to ensure we have a function
const md5 = (input: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return String(rawMd5(input));
};

const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";
const LASTFM_REQUEST_TIMEOUT_MS = 15_000;
const LASTFM_SCROBBLE_BATCH_SIZE = 50;

interface LastFmRecentTrack {
  artist?: { "#text"?: string };
  name?: string;
  album?: { "#text"?: string };
  date?: { uts?: string };
  image?: Array<{ "#text"?: string }>;
  "@attr"?: { nowplaying?: string };
}

export function normalizeRecentTracks(tracks: LastFmRecentTrack[]): RecentScrobble[] {
  return tracks.flatMap((track) => {
    if (track["@attr"]?.nowplaying === "true") return [];
    const timestamp = Number(track.date?.uts);
    if (!track.name || !track.artist?.["#text"] || !Number.isFinite(timestamp)) return [];
    const artworkUrl = track.image?.map((image) => image["#text"] ?? "").find(Boolean) ?? null;
    return [{ artist: track.artist["#text"], track: track.name, album: track.album?.["#text"] ?? "", artworkUrl, timestamp }];
  });
}

export async function resolveLastFmUsername(
  env: Pick<AppEnvironment, "lastfmApiKey" | "lastfmApiSecret">,
  sessionKey: string,
): Promise<{ ok: true; username: string } | { ok: false; message: string }> {
  const response = await fetchLastFm<{ user?: { name?: string } }>("user.getInfo", { sk: sessionKey }, env);
  const username = response.ok ? response.data.user?.name?.trim() : "";
  return username ? { ok: true, username } : { ok: false, message: response.ok ? "Last.fm username missing" : response.message };
}

export async function fetchLastFmRecentTracks(
  env: Pick<AppEnvironment, "lastfmApiKey" | "lastfmApiSecret">,
  sessionKey: string,
  username: string,
  page: number,
  limit: number,
): Promise<{ ok: true; page: number; limit: number; pages: number; total: number; items: RecentScrobble[] } | { ok: false; message: string }> {
  const response = await fetchLastFm<{ recenttracks?: { track?: LastFmRecentTrack | LastFmRecentTrack[]; "@attr"?: { page?: string; totalPages?: string; total?: string } } }>("user.getRecentTracks", { sk: sessionKey, user: username, page: String(page), limit: String(limit) }, env);
  if (!response.ok) return response;
  const recent = response.data.recenttracks;
  const attr = recent?.["@attr"];
  return { ok: true, page, limit, pages: Number(attr?.totalPages) || 1, total: Number(attr?.total) || 0, items: normalizeRecentTracks(recent?.track ? (Array.isArray(recent.track) ? recent.track : [recent.track]) : []) };
}

function createLastFmSignature(
  params: Record<string, string>,
  secret: string
): string {
  // Last.fm signature: sort all params (except api_sig and format), concatenate key+value pairs, append secret, MD5
  const sortedKeys = Object.keys(params)
    .filter(key => key !== "format" && key !== "api_sig") // Exclude format and api_sig from signature
    .sort();
  
  const signatureBase = sortedKeys
    .map((key) => `${key}${params[key] ?? ""}`)
    .join("")
    .concat(secret);

  const hash = md5(signatureBase);
  
  return hash;
}

export async function fetchLastFm<T>(
  method: string,
  params: Record<string, string>,
  env: Pick<AppEnvironment, "lastfmApiKey" | "lastfmApiSecret">
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const apiKey = env.lastfmApiKey?.trim();
  const sharedSecret = env.lastfmApiSecret?.trim();

  if (!apiKey || !sharedSecret) {
    return { ok: false, message: "Last.fm credentials not configured" };
  }

  const payload: Record<string, string> = {
    method,
    api_key: apiKey,
    format: "json",
    ...params,
  };

  const signature = createLastFmSignature(payload, sharedSecret);
  payload.api_sig = signature;

  const body = new URLSearchParams(payload).toString();
  
  let response: Response;
  try {
    response = await fetch(LASTFM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(LASTFM_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: "Last.fm request failed" };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return { ok: false, message: "Last.fm returned an invalid response" };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "Last.fm returned an invalid response" };
  }
  const data = raw as T & { error?: number; message?: string };
  
  if (!response.ok || data.error) {
    const errorMessage = data.message ?? "Last.fm request failed";
    console.error("[fetchLastFm] Error:", errorMessage);
    return { ok: false, message: errorMessage };
  }

  return { ok: true, data };
}

export interface DirectScrobbleInput {
  artist: string;
  track: string;
  album: string;
  timestamp: number;
  duration?: number | null;
}

export type DirectScrobbleTransportResult =
  | { status: "delivered" }
  | { status: "already-delivered" }
  | { status: "ignored"; message?: string }
  | { status: "unconfirmed" }
  | { status: "failed"; message: string; transient: boolean };

/** Sends direct scrobbles in Last.fm's maximum 50-track request batches. */
export async function scrobbleDirectBatch(
  env: Pick<AppEnvironment, "lastfmApiKey" | "lastfmApiSecret"> & Partial<Pick<AppEnvironment, "devMode">>,
  sessionKey: string,
  tracks: DirectScrobbleInput[],
): Promise<DirectScrobbleTransportResult[]> {
  if (env.devMode) {
    console.log("[DEV MODE] Would scrobble direct batch:", tracks.map(({ artist, track, album, timestamp, duration }) => ({
      artist,
      track,
      album,
      timestamp: new Date(timestamp * 1000).toISOString(),
      duration,
    })));
    return tracks.map(() => ({ status: "delivered" as const }));
  }

  const results: DirectScrobbleTransportResult[] = [];
  for (let offset = 0; offset < tracks.length; offset += LASTFM_SCROBBLE_BATCH_SIZE) {
    const batch = tracks.slice(offset, offset + LASTFM_SCROBBLE_BATCH_SIZE);
    const params: Record<string, string> = { sk: sessionKey };
    batch.forEach((item, index) => {
      params[`artist[${index}]`] = item.artist;
      params[`track[${index}]`] = item.track;
      params[`album[${index}]`] = item.album;
      params[`timestamp[${index}]`] = String(item.timestamp);
      if (item.duration !== null && item.duration !== undefined) params[`duration[${index}]`] = String(item.duration);
    });

    const response = await fetchLastFm<{
      scrobbles?: { scrobble?: Array<{ ignoredMessage?: { code?: number; message?: string } }> | { ignoredMessage?: { code?: number; message?: string } } };
    }>("track.scrobble", params, env);
    if (!response.ok) {
      const transient = /request failed|invalid response|rate limit|temporar|timeout/i.test(response.message);
      results.push(...batch.map((): DirectScrobbleTransportResult => ({ status: "failed", message: response.message, transient })));
      continue;
    }
    const raw = response.data.scrobbles?.scrobble;
    const returned = Array.isArray(raw) ? raw : raw ? [raw] : [];
    batch.forEach((_, index) => {
      const ignored = returned[index]?.ignoredMessage;
      if (!returned[index]) results.push({ status: "unconfirmed" });
      else if (ignored?.code && ignored.code !== 0) results.push({ status: "ignored", ...(ignored.message ? { message: ignored.message } : {}) });
      else results.push({ status: "delivered" });
    });
  }
  return results;
}

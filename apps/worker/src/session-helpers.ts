import type { NormalizedRelease, Session } from "@repo/shared";
import { fetchLastFm } from "./lastfm.js";
import type { CloudflareBinding } from "./types.js";

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function currentSessionKey(userId: string): string {
  return `session:current:${userId}`;
}

export async function storeSession(kv: KVNamespace, session: Session): Promise<void> {
  await kv.put(sessionKey(session.id), JSON.stringify(session));
  await kv.put(currentSessionKey(session.userId), session.id);
}

export async function loadSession(kv: KVNamespace, sessionId: string): Promise<Session | null> {
  return (await kv.get<Session>(sessionKey(sessionId), "json")) ?? null;
}

export async function loadCurrentSession(
  kv: KVNamespace,
  userId: string
): Promise<Session | null> {
  const currentId = await kv.get<string>(currentSessionKey(userId));
  if (!currentId) {
    return null;
  }
  return loadSession(kv, currentId);
}

function buildLastFmParams(
  values: Record<string, string | number | null | undefined>
): Record<string, string> {
  const params: Record<string, string> = {};
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    params[key] = String(value);
  });
  return params;
}

export async function sendNowPlaying(
  env: CloudflareBinding,
  sessionKeyValue: string,
  release: NormalizedRelease,
  trackIndex: number
): Promise<{ ok: boolean; message?: string }> {
  if (trackIndex < 0 || trackIndex >= release.tracks.length) {
    return { ok: false, message: "Track index out of bounds" };
  }

  const track = release.tracks[trackIndex];
  if (!track) {
    return { ok: false, message: "Track not found" };
  }

  const isDevMode = env.DEV_MODE === "true";

  if (isDevMode) {
    console.log("[DEV MODE] Would send Now Playing:", {
      artist: track.artist,
      track: track.title,
      album: release.title,
      duration: track.durationSec,
    });
    return { ok: true };
  }

  const result = await fetchLastFm(
    "track.updateNowPlaying",
    {
      ...buildLastFmParams({
        sk: sessionKeyValue,
        artist: track.artist,
        track: track.title,
        album: release.title,
        duration: track.durationSec,
      }),
    },
    env
  );

  if (!result.ok) {
    console.error("[sendNowPlaying] Last.fm API error:", result.message);
  }
  return result;
}

export async function scrobbleTrack(
  env: CloudflareBinding,
  sessionKeyValue: string,
  release: NormalizedRelease,
  trackIndex: number,
  timestampSec: number
): Promise<{ ok: boolean; message?: string }> {
  if (trackIndex < 0 || trackIndex >= release.tracks.length) {
    return { ok: false, message: "Track index out of bounds" };
  }

  const track = release.tracks[trackIndex];
  if (!track) {
    return { ok: false, message: "Track not found" };
  }

  const isDevMode = env.DEV_MODE === "true";

  if (isDevMode) {
    console.log("[DEV MODE] Would scrobble:", {
      artist: track.artist,
      track: track.title,
      album: release.title,
      timestamp: new Date(timestampSec * 1000).toISOString(),
      duration: track.durationSec,
    });
    return { ok: true };
  }

  const result = await fetchLastFm(
    "track.scrobble",
    {
      ...buildLastFmParams({
        sk: sessionKeyValue,
        artist: track.artist,
        track: track.title,
        album: release.title,
        timestamp: timestampSec,
        duration: track.durationSec,
      }),
    },
    env
  );

  if (!result.ok) {
    console.error("[scrobbleTrack] Last.fm API error:", result.message);
  }
  return result;
}

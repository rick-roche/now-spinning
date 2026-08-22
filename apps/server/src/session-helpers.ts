import type { NormalizedRelease, Session } from "@repo/shared";
import { fetchLastFm } from "./lastfm.js";
import type { AppEnvironment } from "./types.js";
import type { SQLiteStorage } from "./storage/storage.js";

export function storeSession(storage: SQLiteStorage, session: Session): Promise<void> { storage.saveSession(session); return Promise.resolve(); }

export function loadSession(storage: SQLiteStorage, sessionId: string): Promise<Session | null> { return Promise.resolve(storage.loadSession(sessionId)); }

export function loadCurrentSession(storage: SQLiteStorage, userId: string): Promise<Session | null> { return Promise.resolve(storage.loadCurrentSession(userId)); }

function buildLastFmParams(values: Record<string, string | number | null | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]));
}

export async function sendNowPlaying(env: AppEnvironment, sessionKey: string, release: NormalizedRelease, trackIndex: number): Promise<{ ok: boolean; message?: string }> {
  const track = release.tracks[trackIndex];
  if (!track) return { ok: false, message: "Track not found" };
  if (env.devMode) {
    console.log("[DEV MODE] Would send Now Playing:", { artist: track.artist, track: track.title, album: release.title, duration: track.durationSec });
    return { ok: true };
  }
  return fetchLastFm("track.updateNowPlaying", buildLastFmParams({ sk: sessionKey, artist: track.artist, track: track.title, album: release.title, duration: track.durationSec }), env);
}

export async function scrobbleTrack(env: AppEnvironment, sessionKey: string, release: NormalizedRelease, trackIndex: number, timestampSec: number): Promise<{ ok: boolean; message?: string }> {
  const track = release.tracks[trackIndex];
  if (!track) return { ok: false, message: "Track not found" };
  if (env.devMode) {
    console.log("[DEV MODE] Would scrobble:", { artist: track.artist, track: track.title, album: release.title, timestamp: new Date(timestampSec * 1000).toISOString(), duration: track.durationSec });
    return { ok: true };
  }
  return fetchLastFm("track.scrobble", buildLastFmParams({ sk: sessionKey, artist: track.artist, track: track.title, album: release.title, timestamp: timestampSec, duration: track.durationSec }), env);
}

/**
 * Session sync for background recovery.
 *
 * When a PWA is suspended (e.g. iOS backgrounding), client-side timers freeze.
 * On resume the server uses this pure function to determine which tracks
 * became eligible for scrobbling based on authoritative timestamps.
 */

import type { Session, SessionTrackState } from "../domain/session.js";
import { isEligibleToScrobble } from "./eligibility.js";

export interface SyncScrobbleAction {
  trackIndex: number;
  elapsedMs: number;
  startedAt: number;
}

export interface SyncSessionResult {
  session: Session;
  scrobbleActions: SyncScrobbleAction[];
}

/**
 * Walk forward from the current track, scrobbling each track whose
 * wall-clock elapsed time (syncAt − track.startedAt) meets the threshold.
 *
 * Handles multi-track catch-up: if the app was backgrounded longer than
 * one track's duration, subsequent tracks get their startedAt derived from
 * the previous track's end time (startedAt + durationMs).
 *
 * Pure — caller is responsible for Last.fm API calls.
 */
export function syncSession(
  session: Session,
  syncAt: number,
  thresholdPercent: number
): SyncSessionResult {
  if (session.state === "ended" || session.state === "paused") {
    return { session, scrobbleActions: [] };
  }

  const scrobbleActions: SyncScrobbleAction[] = [];
  let currentSession = session;

  while (currentSession.state === "running") {
    const { currentIndex } = currentSession;
    const track = currentSession.tracks[currentIndex];

    if (!track) break;
    if (track.status === "scrobbled") break;
    if (track.startedAt === null) break;

    const elapsedMs = syncAt - track.startedAt;

    const releaseTrack = currentSession.release.tracks[currentIndex];
    const durationMs =
      releaseTrack?.durationSec != null && releaseTrack.durationSec > 0
        ? releaseTrack.durationSec * 1000
        : null;

    if (!isEligibleToScrobble(elapsedMs, durationMs, thresholdPercent)) {
      break;
    }

    scrobbleActions.push({
      trackIndex: currentIndex,
      elapsedMs,
      startedAt: track.startedAt,
    });

    const updatedTracks: SessionTrackState[] = [...currentSession.tracks];
    updatedTracks[currentIndex] = {
      ...track,
      status: "scrobbled",
      scrobbledAt: syncAt,
    };

    const nextIndex = currentIndex + 1;
    if (nextIndex >= currentSession.tracks.length) {
      currentSession = {
        ...currentSession,
        tracks: updatedTracks,
        state: "ended",
      };
      break;
    }

    // Derive next track's startedAt from when the previous track would have
    // ended (startedAt + durationMs), falling back to syncAt if unknown.
    const nextTrack = updatedTracks[nextIndex];
    if (nextTrack) {
      const trackEndTime =
        durationMs !== null ? track.startedAt + durationMs : syncAt;
      updatedTracks[nextIndex] = {
        ...nextTrack,
        startedAt: nextTrack.startedAt ?? trackEndTime,
      };
    }

    currentSession = {
      ...currentSession,
      currentIndex: nextIndex,
      tracks: updatedTracks,
      state: "running",
    };
  }

  return { session: currentSession, scrobbleActions };
}

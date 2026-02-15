import type { NormalizedRelease } from "./release.js";

/**
 * Session state values.
 */
export type SessionState = "running" | "paused" | "ended";

/**
 * Track scrobble status within a session.
 */
export type SessionTrackStatus = "pending" | "scrobbled" | "skipped";

/**
 * Per-track state within a session.
 */
export interface SessionTrackState {
  /** Track index (0-based, matching NormalizedTrack.index) */
  index: number;
  /** Timestamp when track playback started (epoch ms, null if not started) */
  startedAt: number | null;
  /** Current status of this track */
  status: SessionTrackStatus;
  /** Timestamp when track was scrobbled (epoch ms, null if not scrobbled) */
  scrobbledAt: number | null;
}

/**
 * Listening session for a vinyl release.
 * Tracks playback state and scrobble progress.
 */
export interface Session {
  /** Unique session ID */
  id: string;
  /** Internal user ID (tied to session cookie) */
  userId: string;
  /** Release being played (snapshot or reference) */
  release: NormalizedRelease;
  /** Current playback state */
  state: SessionState;
  /** Index of currently playing track (0-based) */
  currentIndex: number;
  /** Timestamp when session started (epoch ms) */
  startedAt: number;
  /** Per-track state */
  tracks: SessionTrackState[];
}

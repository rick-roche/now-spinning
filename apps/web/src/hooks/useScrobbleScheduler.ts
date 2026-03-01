import { useEffect, useRef } from "react";
import { getScrobbleThresholdMs } from "@repo/shared";
import { getScrobbleDelay } from "../lib/settings";

/**
 * Manages automatic scrobble submission when track reaches the threshold.
 * Tracks which tracks have been scrobbled to prevent duplicates.
 */
export function useScrobbleScheduler(
  sessionId: string | null,
  trackIndex: number,
  isRunning: boolean,
  durationMs: number | null,
  elapsedMs: number,
  onScrobble: (elapsedMs: number, thresholdPercent: number) => void | Promise<void>
) {
  const timerRef = useRef<number | null>(null);
  const scrobbledTracksRef = useRef<Set<string>>(new Set());
  const elapsedMsRef = useRef(elapsedMs);
  const trackIdentifier = sessionId ? `${sessionId}:${trackIndex}` : null;

  // Keep elapsedMs ref up to date
  useEffect(() => {
    elapsedMsRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!sessionId || !isRunning || !trackIdentifier) return;

    // Check if already scrobbled
    if (scrobbledTracksRef.current.has(trackIdentifier)) {
      return;
    }

    const thresholdPercent = getScrobbleDelay();
    const thresholdMs = getScrobbleThresholdMs(durationMs, thresholdPercent);

    if (!thresholdMs) return;

    // Set up a recurring check every 100ms to see if we've hit the threshold
    const intervalHandle = window.setInterval(() => {
      // Check again if already scrobbled (may have been manually scrobbled)
      if (scrobbledTracksRef.current.has(trackIdentifier)) {
        window.clearInterval(intervalHandle);
        return;
      }

      if (elapsedMsRef.current >= thresholdMs) {
        scrobbledTracksRef.current.add(trackIdentifier);
        void onScrobble(elapsedMsRef.current, thresholdPercent);
        window.clearInterval(intervalHandle);
      }
    }, 100);

    timerRef.current = intervalHandle;

    return () => {
      if (intervalHandle) {
        window.clearInterval(intervalHandle);
      }
    };
  }, [trackIdentifier, isRunning, durationMs, onScrobble, sessionId]);

  const markAsScrobbled = (sessionId: string, trackIndex: number) => {
    scrobbledTracksRef.current.add(`${sessionId}:${trackIndex}`);
  };

  const isScrobbled = (sessionId: string, trackIndex: number) => {
    return scrobbledTracksRef.current.has(`${sessionId}:${trackIndex}`);
  };

  return {
    markAsScrobbled,
    isScrobbled,
  };
}

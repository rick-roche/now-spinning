import { useEffect, useRef, useState } from "react";
import { formatDurationMs } from "../lib/format";

/**
 * Manages elapsed time tracking for a session with sessionStorage persistence.
 * Handles running/paused states and persists timer state across page reloads.
 */
export function useSessionTimer(
  sessionId: string | null,
  trackIndex: number,
  isRunning: boolean
) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const localElapsedRef = useRef(0);
  const localStartRef = useRef<number | null>(null);
  const storageKeyRef = useRef<string | null>(null);
  const lastTrackKeyRef = useRef<string | null>(null);

  // Update clock every second when running
  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  // Handle track changes and timer persistence
  useEffect(() => {
    if (!sessionId) return;

    const trackKey = `${sessionId}:${trackIndex}`;
    if (lastTrackKeyRef.current !== trackKey) {
      lastTrackKeyRef.current = trackKey;
      storageKeyRef.current = `now-spinning:session-timer:${trackKey}`;

      try {
        const stored = sessionStorage.getItem(storageKeyRef.current);
        if (stored) {
          const data = JSON.parse(stored) as {
            elapsedMs: number;
            running: boolean;
            updatedAt: number;
          };
          const safeElapsed = Number.isFinite(data.elapsedMs) ? data.elapsedMs : 0;
          const safeUpdatedAt = Number.isFinite(data.updatedAt) ? data.updatedAt : Date.now();
          const wasRunning = data.running === true;

          if (isRunning) {
            const carriedElapsed = wasRunning
              ? safeElapsed + Math.max(0, Date.now() - safeUpdatedAt)
              : safeElapsed;
            localElapsedRef.current = carriedElapsed;
            localStartRef.current = Date.now();
          } else {
            localElapsedRef.current = safeElapsed;
            localStartRef.current = null;
          }
        } else {
          localElapsedRef.current = 0;
          localStartRef.current = isRunning ? Date.now() : null;
        }
      } catch {
        localElapsedRef.current = 0;
        localStartRef.current = isRunning ? Date.now() : null;
      }
      return;
    }

    // Handle state changes within the same track
    if (!isRunning && localStartRef.current !== null) {
      localElapsedRef.current += Date.now() - localStartRef.current;
      localStartRef.current = null;
    }

    if (isRunning && localStartRef.current === null) {
      localStartRef.current = Date.now();
    }

    setElapsedMs(
      localElapsedRef.current +
        (localStartRef.current ? Date.now() - localStartRef.current : 0)
    );
  }, [sessionId, trackIndex, isRunning]);

  useEffect(() => {
    setElapsedMs(
      localElapsedRef.current +
        (localStartRef.current ? nowMs - localStartRef.current : 0)
    );
  }, [nowMs]);

  // Persist to sessionStorage
  useEffect(() => {
    if (!storageKeyRef.current) return;

    const currentElapsed =
      localElapsedRef.current +
      (localStartRef.current ? Date.now() - localStartRef.current : 0);

    try {
      sessionStorage.setItem(
        storageKeyRef.current,
        JSON.stringify({
          elapsedMs: currentElapsed,
          running: isRunning && localStartRef.current !== null,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [nowMs, isRunning]);

  const formatTime = (valueMs: number | null) => formatDurationMs(valueMs);

  return {
    elapsedMs,
    formatTime,
  };
}

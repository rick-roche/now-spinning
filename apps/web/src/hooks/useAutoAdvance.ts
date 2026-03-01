import { useEffect, useRef } from "react";

/**
 * Manages automatic track advancement when the current track completes.
 * Calculates remaining time and triggers callback when track ends.
 */
export function useAutoAdvance(
  isEnabled: boolean,
  durationMs: number | null,
  elapsedMs: number,
  onAdvance: () => void | Promise<void>
) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear existing timer
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Don't set timer if disabled or no duration
    if (!isEnabled || !durationMs || durationMs <= 0) return;

    const remainingMs = durationMs - elapsedMs;

    // If track already complete, advance immediately
    if (remainingMs <= 0) {
      void onAdvance();
      return;
    }

    // Set timer for remaining duration
    timerRef.current = window.setTimeout(() => {
      void onAdvance();
    }, remainingMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isEnabled, durationMs, elapsedMs, onAdvance]);

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return { cancel };
}

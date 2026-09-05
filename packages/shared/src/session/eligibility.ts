/**
 * Scrobble eligibility calculation
 * 
 * Last.fm's scrobbling guidelines:
 * - Track must be at least 30 seconds long
 * - Must be played for at least half its duration, or 4 minutes (whichever occurs earlier)
 * 
 * For configurable threshold: use percentage of duration when known,
 * fallback to 30 seconds minimum when unknown
 */

const MINIMUM_SCROBBLE_DURATION_MS = 30_000; // 30 seconds
const MAXIMUM_SCROBBLE_DURATION_MS = 240_000; // 4 minutes

export function isScrobblableDuration(durationMs: number | null): boolean {
  return durationMs === null || durationMs <= 0 || durationMs >= MINIMUM_SCROBBLE_DURATION_MS;
}

/**
 * Check if a track is eligible to scrobble based on elapsed time
 * 
 * @param elapsedMs - How long the track has been playing (milliseconds)
 * @param durationMs - Track duration (milliseconds), or null if unknown
 * @param thresholdPercent - Percentage of track duration required (0-100)
 * @returns true if track has been played long enough to scrobble
 */
export function isEligibleToScrobble(
  elapsedMs: number,
  durationMs: number | null,
  thresholdPercent: number
): boolean {
  if (elapsedMs < 0) {
    return false;
  }

  if (!isScrobblableDuration(durationMs)) {
    return false;
  }

  // If duration is known, use percentage threshold within provider bounds.
  if (durationMs !== null && durationMs > 0) {
    const thresholdMs = getScrobbleThresholdMs(durationMs, thresholdPercent);
    if (thresholdMs === null) return false;
    return elapsedMs >= thresholdMs;
  }

  // If duration is unknown, fall back to minimum time threshold
  return elapsedMs >= MINIMUM_SCROBBLE_DURATION_MS;
}

/**
 * Calculate when a track becomes eligible to scrobble
 * 
 * @param durationMs - Track duration (milliseconds), or null if unknown
 * @param thresholdPercent - Percentage of track duration required (0-100)
 * @returns Milliseconds until track is eligible, or null if unknown
 */
export function getScrobbleThresholdMs(
  durationMs: number | null,
  thresholdPercent: number
): number | null {
  if (durationMs !== null && durationMs > 0) {
    if (!isScrobblableDuration(durationMs)) return null;
    return Math.min(
      MAXIMUM_SCROBBLE_DURATION_MS,
      Math.max(MINIMUM_SCROBBLE_DURATION_MS, (durationMs * thresholdPercent) / 100)
    );
  }
  // If duration unknown, use minimum threshold
  return MINIMUM_SCROBBLE_DURATION_MS;
}

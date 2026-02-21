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

  // If duration is known, use percentage threshold
  if (durationMs !== null && durationMs > 0) {
    const thresholdMs = (durationMs * thresholdPercent) / 100;
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
    return (durationMs * thresholdPercent) / 100;
  }
  // If duration unknown, use minimum threshold
  return MINIMUM_SCROBBLE_DURATION_MS;
}

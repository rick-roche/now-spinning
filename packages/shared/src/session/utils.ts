import type { NormalizedTrack } from "../domain/release.js";

/**
 * Derives the record side identifier from a normalized track.
 * Uses the track's `side` field when present; falls back to the first
 * letter of `position` (e.g. "A1" → "A").
 */
export function getSideFromTrack(
  track: Pick<NormalizedTrack, "side" | "position"> | null | undefined
): string | null {
  if (!track) return null;
  if (track.side) return track.side;
  const match = track.position?.trim().match(/^[A-Za-z]/);
  return match ? match[0].toUpperCase() : null;
}

import type { NormalizedRelease, NormalizedTrack, PhysicalMediaType } from "../domain/release.js";

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

export type PhysicalMediaBoundary = "flip" | "change-disc";

/** Returns the physical action needed before moving to the next track. */
export function getPhysicalMediaBoundary(
  release: Pick<NormalizedRelease, "mediaType">,
  current: NormalizedTrack | null | undefined,
  next: NormalizedTrack | null | undefined
): PhysicalMediaBoundary | null {
  if (!current || !next) return null;

  const mediaType: PhysicalMediaType = release.mediaType ?? "unknown";
  if (mediaType === "vinyl" || mediaType === "cassette") {
    const currentSide = getSideFromTrack(current);
    const nextSide = getSideFromTrack(next);
    return currentSide !== null && nextSide !== null && currentSide !== nextSide ? "flip" : null;
  }

  if (mediaType === "cd") {
    return current.discNumber !== null &&
      current.discNumber !== undefined &&
      next.discNumber !== null &&
      next.discNumber !== undefined &&
      current.discNumber !== next.discNumber
      ? "change-disc"
      : null;
  }

  return null;
}

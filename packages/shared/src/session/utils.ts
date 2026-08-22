import type { NormalizedRelease, NormalizedTrack, PhysicalMediaType } from "../domain/release.js";
import { derivePhysicalMediaType, deriveSide } from "../normalize/discogsRelease.js";

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
  return deriveSide(track.position);
}

export type PhysicalMediaBoundary = "flip" | "change-disc";

/** Returns the physical action needed before moving to the next track. */
export function getPhysicalMediaBoundary(
  release: Partial<Pick<NormalizedRelease, "mediaType" | "formats">>,
  current: NormalizedTrack | null | undefined,
  next: NormalizedTrack | null | undefined
): PhysicalMediaBoundary | null {
  if (!current || !next) return null;

  const mediaType: PhysicalMediaType = release.mediaType ?? derivePhysicalMediaType(release.formats);
  // Fall back to track metadata for older or incomplete release snapshots.
  if (mediaType === "unknown") {
    const currentSide = getSideFromTrack(current);
    const nextSide = getSideFromTrack(next);
    if (currentSide !== null && nextSide !== null && currentSide !== nextSide) return "flip";

    if (
      current.discNumber !== null &&
      current.discNumber !== undefined &&
      next.discNumber !== null &&
      next.discNumber !== undefined &&
      current.discNumber !== next.discNumber
    ) {
      return "change-disc";
    }
  }
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

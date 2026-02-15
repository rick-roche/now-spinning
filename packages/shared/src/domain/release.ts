/**
 * Normalized release model (from Discogs data).
 * Represents a vinyl release with consistent structure.
 */
export interface NormalizedRelease {
  /** Discogs release ID */
  id: string;
  /** Release title */
  title: string;
  /** Primary artist (display name) */
  artist: string;
  /** Release year (null if unknown) */
  year: number | null;
  /** Cover image URL (null if unavailable) */
  coverUrl: string | null;
  /** Ordered list of tracks */
  tracks: NormalizedTrack[];
}

/**
 * Normalized track model.
 * Represents a single track on a release with stable ordering.
 */
export interface NormalizedTrack {
  /** Position as shown on release (e.g., "A1", "B3", "1") */
  position: string;
  /** Track title */
  title: string;
  /** Track artist (fallback to release artist) */
  artist: string;
  /** Duration in seconds (null if unknown) */
  durationSec: number | null;
  /** Side identifier derived from position (null if not applicable) */
  side: "A" | "B" | "C" | "D" | null;
  /** 0-based index for stable internal ordering */
  index: number;
}

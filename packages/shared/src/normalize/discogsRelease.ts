import type { NormalizedRelease, NormalizedTrack } from "../domain/release.js";

export interface DiscogsReleaseApiResponse {
  id?: number;
  title?: string;
  year?: number;
  artists?: Array<{ name?: string }>;
  images?: Array<{ uri?: string; type?: string }>;
  tracklist?: DiscogsTrack[];
}

export interface DiscogsTrack {
  position?: string;
  title?: string;
  duration?: string;
  artists?: Array<{ name?: string }>;
  type_?: string;
}

export function parseDiscogsDuration(duration?: string | null): number | null {
  if (!duration) {
    return null;
  }

  const trimmed = duration.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 1 && parts[0] !== undefined) {
    return parts[0];
  }

  return null;
}

function deriveSide(position?: string | null): NormalizedTrack["side"] {
  if (!position) {
    return null;
  }

  const match = position.trim().toUpperCase().match(/^[ABCD]/);
  if (!match) {
    return null;
  }

  return match[0] as NormalizedTrack["side"];
}

function resolveCoverUrl(images?: Array<{ uri?: string; type?: string }>): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const primary = images.find((image) => image.type === "primary");
  return primary?.uri ?? images[0]?.uri ?? null;
}

export function normalizeDiscogsRelease(data: DiscogsReleaseApiResponse): NormalizedRelease {
  const releaseArtist = data.artists?.[0]?.name ?? "Unknown Artist";
  const tracks = (data.tracklist ?? [])
    .filter((track) => track.type_ !== "heading")
    .map((track, index) => {
      const position = track.position?.trim() || `${index + 1}`;
      return {
        position,
        title: track.title ?? "Untitled",
        artist: track.artists?.[0]?.name ?? releaseArtist,
        durationSec: parseDiscogsDuration(track.duration),
        side: deriveSide(position),
        index,
      };
    });

  return {
    id: String(data.id ?? ""),
    title: data.title ?? "Untitled",
    artist: releaseArtist,
    year: Number.isFinite(data.year) ? (data.year as number) : null,
    coverUrl: resolveCoverUrl(data.images),
    tracks,
  };
}

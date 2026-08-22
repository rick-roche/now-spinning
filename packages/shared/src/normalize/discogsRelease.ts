import type { NormalizedRelease, NormalizedTrack, PhysicalMediaType } from "../domain/release.js";
import { stripDiscogsDisambiguation } from "./artistName.js";

export interface DiscogsReleaseApiResponse {
  id?: number;
  title?: string;
  year?: number;
  artists?: Array<{ name?: string }>;
  images?: Array<{ uri?: string; type?: string }>;
  formats?: Array<{ name?: string; descriptions?: string[] }>;
  master_id?: number;
  tracklist?: DiscogsTrack[];
}

export function formatDiscogsFormats(
  formats?: Array<{ name?: string; descriptions?: string[] }>
): string[] {
  return (formats ?? []).flatMap((format) => {
    const value = [format.name, ...(format.descriptions ?? [])].filter(Boolean).join(" ").trim();
    return value ? [value] : [];
  });
}

export function derivePhysicalMediaType(formats: string[]): PhysicalMediaType {
  const values = formats.join(" ").toLowerCase();
  if (/(vinyl|\blp\b|\bep\b|\b7\"|\b10\"|\b12\")/.test(values)) return "vinyl";
  if (/(cassette|\btape\b)/.test(values)) return "cassette";
  if (/(\bcd\b|compact disc)/.test(values)) return "cd";
  return "unknown";
}

interface DiscogsTrack {
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

function deriveDiscNumber(position: string): number | null {
  const match = position.match(/^(\d+)\s*[-.]\s*\d+/);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

function resolveCoverUrl(images?: Array<{ uri?: string; type?: string }>): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const primary = images.find((image) => image.type === "primary");
  return primary?.uri ?? images[0]?.uri ?? null;
}

export function normalizeDiscogsRelease(data: DiscogsReleaseApiResponse): NormalizedRelease {
  const releaseArtist = stripDiscogsDisambiguation(data.artists?.[0]?.name ?? "Unknown Artist");
  const formats = formatDiscogsFormats(data.formats);
  const tracks = (data.tracklist ?? [])
    .filter((track) => track.type_ !== "heading")
    .map((track, index) => {
      const position = track.position?.trim() || `${index + 1}`;
      return {
        position,
        title: track.title ?? "Untitled",
        artist: stripDiscogsDisambiguation(track.artists?.[0]?.name ?? releaseArtist),
        durationSec: parseDiscogsDuration(track.duration),
        side: deriveSide(position),
        discNumber: deriveDiscNumber(position),
        index,
      };
    });

  return {
    id: String(data.id ?? ""),
    title: data.title ?? "Untitled",
    artist: releaseArtist,
    year: Number.isFinite(data.year) ? (data.year as number) : null,
    coverUrl: resolveCoverUrl(data.images),
    mediaType: derivePhysicalMediaType(formats),
    formats,
    masterId: data.master_id ? String(data.master_id) : null,
    tracks,
  };
}

/**
 * Fills only missing concrete-release durations from its master. Exact track
 * positions win; a same-index, same-title match is a conservative fallback.
 */
export function mergeMissingTrackDurations(
  release: NormalizedRelease,
  master: Pick<NormalizedRelease, "tracks">
): NormalizedRelease {
  const tracks = release.tracks.map((track) => {
    if (track.durationSec !== null) return track;

    const exactPosition = master.tracks.find(
      (masterTrack) => masterTrack.position === track.position && masterTrack.durationSec !== null
    );
    const sameIndex = master.tracks[track.index];
    const fallback =
      sameIndex?.title.trim().toLowerCase() === track.title.trim().toLowerCase() &&
      sameIndex.durationSec !== null
        ? sameIndex
        : undefined;
    const source = exactPosition ?? fallback;
    return source ? { ...track, durationSec: source.durationSec } : track;
  });

  return { ...release, tracks };
}

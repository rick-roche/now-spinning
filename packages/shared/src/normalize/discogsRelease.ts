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

export function derivePhysicalMediaType(formats: readonly string[] | string | undefined): PhysicalMediaType {
  const values = (Array.isArray(formats) ? formats : [formats ?? ""]).join(" ").toLowerCase();
  if (/(\bcd\b|compact disc)/.test(values)) return "cd";
  if (/(cassette|\btape\b)/.test(values)) return "cassette";
  if (/(vinyl|\blp\b|\b7"|\b10"|\b12")/.test(values)) return "vinyl";
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

  if (!/^\d+(?::\d{1,2}){0,2}$/.test(trimmed)) return null;
  const parts = trimmed.split(":").map(Number);

  if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined && parts[1] < 60 && parts[2] < 60) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined && parts[1] < 60) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 1 && parts[0] !== undefined) {
    return parts[0];
  }

  return null;
}

export function deriveSide(position?: string | null): NormalizedTrack["side"] {
  if (!position) {
    return null;
  }

  const match = position.trim().toUpperCase().match(/^(?:SIDE\s*)?([A-Z])\s*\d/);
  if (!match) {
    return null;
  }

  return match[1] ?? null;
}

export function deriveDiscNumber(position: string): number | null {
  const match = position.trim().match(/^(?:CD\s*|DISC\s*)?(\d+)\s*[-.]\s*\d+/i);
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
  let headingDiscNumber: number | null = null;
  let trackIndex = 0;
  const tracks = (data.tracklist ?? []).flatMap((track) => {
    if (track.type_ === "heading") {
      const heading = `${track.position ?? ""} ${track.title ?? ""}`;
      const headingMatch = heading.match(/(?:disc|cd)\s*(\d+)/i);
      headingDiscNumber = headingMatch?.[1] ? Number.parseInt(headingMatch[1], 10) : (deriveDiscNumber(heading) ?? headingDiscNumber);
      return [];
    }
    const index = trackIndex++;
    const position = track.position?.trim() || `${index + 1}`;
    return [{
        position,
        title: track.title ?? "Untitled",
        artist: stripDiscogsDisambiguation(track.artists?.[0]?.name ?? releaseArtist),
        durationSec: parseDiscogsDuration(track.duration),
        side: deriveSide(position),
        discNumber: deriveDiscNumber(position) ?? headingDiscNumber,
        index,
      }];
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
 * title plus position wins; a same-index title/artist match is a conservative
 * fallback even when editions use different position notation.
 */
export function mergeMissingTrackDurations(
  release: NormalizedRelease,
  master: Pick<NormalizedRelease, "tracks">
): NormalizedRelease {
  const matchText = (value: string): string => value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+(?:ft\.?|feat\.?)(?:\s+.*)?$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  const masterTracksByMatch = new Map<string, NormalizedTrack>();
  for (const masterTrack of master.tracks) {
    if (masterTrack.durationSec === null) continue;
    const key = `${masterTrack.position}\u0000${matchText(masterTrack.title)}\u0000${matchText(masterTrack.artist)}`;
    if (!masterTracksByMatch.has(key)) masterTracksByMatch.set(key, masterTrack);
  }

  const tracks = release.tracks.map((track) => {
    if (track.durationSec !== null) return track;

    const title = matchText(track.title);
    const artist = matchText(track.artist);
    const exactPosition = masterTracksByMatch.get(`${track.position}\u0000${title}\u0000${artist}`);
    const sameIndex = master.tracks[track.index];
    const fallback =
      release.tracks.length === master.tracks.length &&
      sameIndex !== undefined &&
      matchText(sameIndex.title) === title &&
      matchText(sameIndex.artist) === artist &&
      sameIndex.durationSec !== null
        ? sameIndex
        : undefined;
    const source = exactPosition ?? fallback;
    return source ? { ...track, durationSec: source.durationSec } : track;
  });

  return { ...release, tracks };
}

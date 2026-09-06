import { describe, expect, it } from "vitest";
import {
  mergeMissingTrackDurations,
  normalizeDiscogsRelease,
  parseDiscogsDuration,
  deriveDiscNumber,
  derivePhysicalMediaType,
} from "./discogsRelease.js";

describe("parseDiscogsDuration", () => {
  it("parses mm:ss and hh:mm:ss values", () => {
    expect(parseDiscogsDuration("3:45")).toBe(225);
    expect(parseDiscogsDuration("01:02:03")).toBe(3723);
  });

  it("returns null for empty or invalid values", () => {
    expect(parseDiscogsDuration("")).toBeNull();
    expect(parseDiscogsDuration("not-a-time")).toBeNull();
  });

  it("returns null for null and undefined", () => {
    expect(parseDiscogsDuration(null)).toBeNull();
    expect(parseDiscogsDuration(undefined)).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseDiscogsDuration("   ")).toBeNull();
  });

  it("parses seconds-only duration", () => {
    expect(parseDiscogsDuration("45")).toBe(45);
  });

  it("returns null for partially invalid durations", () => {
    expect(parseDiscogsDuration("3:ab")).toBeNull();
    expect(parseDiscogsDuration("xx:30")).toBeNull();
  });

  it("rejects malformed duration components", () => {
    expect(parseDiscogsDuration("3:99")).toBeNull();
    expect(parseDiscogsDuration("3:30x")).toBeNull();
    expect(parseDiscogsDuration("-1:30")).toBeNull();
  });
});

describe("normalizeDiscogsRelease", () => {
  it("normalizes track ordering, sides, and artist fallbacks", () => {
    const normalized = normalizeDiscogsRelease({
      id: 42,
      title: "Test Release",
      year: 1999,
      artists: [{ name: "Release Artist" }],
      images: [
        { uri: "https://example.com/primary.jpg", type: "primary" },
        { uri: "https://example.com/alt.jpg", type: "secondary" },
      ],
      tracklist: [
        { position: "A1", title: "Intro", duration: "1:00" },
        { position: "B2", title: "Finale", duration: "3:30", artists: [{ name: "Guest" }] },
        { position: "", title: "Hidden", duration: "" },
        { position: "", title: "Side A", type_: "heading" },
      ],
    });

    expect(normalized.id).toBe("42");
    expect(normalized.artist).toBe("Release Artist");
    expect(normalized.coverUrl).toBe("https://example.com/primary.jpg");
    expect(normalized.tracks).toHaveLength(3);

    expect(normalized.tracks[0]).toMatchObject({
      position: "A1",
      title: "Intro",
      artist: "Release Artist",
      durationSec: 60,
      side: "A",
      index: 0,
    });

    expect(normalized.tracks[1]).toMatchObject({
      position: "B2",
      title: "Finale",
      artist: "Guest",
      durationSec: 210,
      side: "B",
      index: 1,
    });

    expect(normalized.tracks[2]).toMatchObject({
      position: "3",
      title: "Hidden",
      artist: "Release Artist",
      durationSec: null,
      side: null,
      index: 2,
    });
  });

  it("uses 'Unknown Artist' when artists array is missing", () => {
    const normalized = normalizeDiscogsRelease({
      id: 1,
      title: "No Artist Release",
      tracklist: [{ position: "A1", title: "Track 1" }],
    });

    expect(normalized.artist).toBe("Unknown Artist");
    expect(normalized.tracks[0]?.artist).toBe("Unknown Artist");
  });

  it("uses 'Unknown Artist' when artists array is empty", () => {
    const normalized = normalizeDiscogsRelease({
      id: 2,
      title: "Empty Artists",
      artists: [],
      tracklist: [{ position: "A1", title: "Track 1" }],
    });

    expect(normalized.artist).toBe("Unknown Artist");
  });

  it("returns null coverUrl when images array is empty", () => {
    const normalized = normalizeDiscogsRelease({
      id: 3,
      title: "No Images",
      images: [],
      tracklist: [],
    });

    expect(normalized.coverUrl).toBeNull();
  });

  it("returns null coverUrl when images is undefined", () => {
    const normalized = normalizeDiscogsRelease({
      id: 4,
      title: "Missing Images",
      tracklist: [],
    });

    expect(normalized.coverUrl).toBeNull();
  });

  it("falls back to first image when no primary image exists", () => {
    const normalized = normalizeDiscogsRelease({
      id: 5,
      title: "Secondary Only",
      images: [
        { uri: "https://example.com/secondary.jpg", type: "secondary" },
        { uri: "https://example.com/other.jpg", type: "secondary" },
      ],
      tracklist: [],
    });

    expect(normalized.coverUrl).toBe("https://example.com/secondary.jpg");
  });

  it("filters out heading-only tracklist", () => {
    const normalized = normalizeDiscogsRelease({
      id: 6,
      title: "Headings Only",
      tracklist: [
        { position: "", title: "Side A", type_: "heading" },
        { position: "", title: "Side B", type_: "heading" },
      ],
    });

    expect(normalized.tracks).toHaveLength(0);
  });

  it("handles missing tracklist", () => {
    const normalized = normalizeDiscogsRelease({
      id: 7,
      title: "No Tracklist",
    });

    expect(normalized.tracks).toHaveLength(0);
  });

  it("uses 'Untitled' for tracks with missing title", () => {
    const normalized = normalizeDiscogsRelease({
      id: 8,
      title: "Missing Titles",
      tracklist: [{ position: "A1" }],
    });

    expect(normalized.tracks[0]?.title).toBe("Untitled");
  });

  it("uses 'Untitled' for release with missing title", () => {
    const normalized = normalizeDiscogsRelease({
      id: 9,
      tracklist: [],
    });

    expect(normalized.title).toBe("Untitled");
  });

  it("handles missing year", () => {
    const normalized = normalizeDiscogsRelease({
      id: 10,
      title: "No Year",
      tracklist: [],
    });

    expect(normalized.year).toBeNull();
  });

  it("handles missing id", () => {
    const normalized = normalizeDiscogsRelease({
      title: "No ID",
      tracklist: [],
    });

    expect(normalized.id).toBe("");
  });

  it("assigns numeric position when position is empty", () => {
    const normalized = normalizeDiscogsRelease({
      id: 11,
      title: "Numeric Fallback",
      tracklist: [
        { title: "First" },
        { position: "", title: "Second" },
        { position: "  ", title: "Third" },
      ],
    });

    expect(normalized.tracks[0]?.position).toBe("1");
    expect(normalized.tracks[1]?.position).toBe("2");
    expect(normalized.tracks[2]?.position).toBe("3");
  });

  it("detects sides A through D", () => {
    const normalized = normalizeDiscogsRelease({
      id: 12,
      title: "Four Sides",
      tracklist: [
        { position: "A1", title: "T1" },
        { position: "B1", title: "T2" },
        { position: "C1", title: "T3" },
        { position: "D1", title: "T4" },
      ],
    });

    expect(normalized.tracks[0]?.side).toBe("A");
    expect(normalized.tracks[1]?.side).toBe("B");
    expect(normalized.tracks[2]?.side).toBe("C");
    expect(normalized.tracks[3]?.side).toBe("D");
  });

  it("returns null side for numeric-only positions", () => {
    const normalized = normalizeDiscogsRelease({
      id: 13,
      title: "CD Release",
      tracklist: [
        { position: "1", title: "Track 1" },
        { position: "2", title: "Track 2" },
      ],
    });

    expect(normalized.tracks[0]?.side).toBeNull();
    expect(normalized.tracks[1]?.side).toBeNull();
  });

  it("strips Discogs disambiguation suffix from release and track artists", () => {
    const normalized = normalizeDiscogsRelease({
      id: 14,
      title: "Disambiguated Release",
      artists: [{ name: "John Smith (2)" }],
      tracklist: [
        { position: "A1", title: "Track One" },
        { position: "A2", title: "Collab", artists: [{ name: "Jane Doe (3)" }] },
        { position: "B1", title: "Solo", artists: [{ name: "Plain Artist" }] },
      ],
    });

    expect(normalized.artist).toBe("John Smith");
    expect(normalized.tracks[0]?.artist).toBe("John Smith");
    expect(normalized.tracks[1]?.artist).toBe("Jane Doe");
    expect(normalized.tracks[2]?.artist).toBe("Plain Artist");
  });

  it("derives physical medium, formats, master ID, and CD disc numbers", () => {
    const normalized = normalizeDiscogsRelease({
      id: 15,
      master_id: 9,
      formats: [{ name: "CD", descriptions: ["Album", "2xCD"] }],
      tracklist: [
        { position: "1-1", title: "Disc one" },
        { position: "2-1", title: "Disc two" },
      ],
    });

    expect(normalized).toMatchObject({
      mediaType: "cd",
      formats: ["CD Album 2xCD"],
      masterId: "9",
    });
    expect(normalized.tracks.map((track) => track.discNumber)).toEqual([1, 2]);
  });

  it("fills only missing track durations from matching master tracks", () => {
    const release = normalizeDiscogsRelease({
      id: 16,
      tracklist: [
        { position: "A1", title: "Existing", duration: "2:00" },
        { position: "A2", title: "Missing" },
        { position: "A3", title: "Unmatched" },
      ],
    });
    const master = normalizeDiscogsRelease({
      id: 17,
      tracklist: [
        { position: "A1", title: "Existing", duration: "3:00" },
        { position: "A2", title: "Missing", duration: "4:00" },
        { position: "B3", title: "Different", duration: "5:00" },
      ],
    });

    expect(mergeMissingTrackDurations(release, master).tracks.map((track) => track.durationSec)).toEqual([
      120,
      240,
      null,
    ]);
  });

  it("fills missing duration for a same-index track with compatible position notation", () => {
    const release = normalizeDiscogsRelease({
      id: 18,
      tracklist: [{ position: "A1", title: "Opening Track", duration: "" }],
    });
    const master = normalizeDiscogsRelease({
      id: 19,
      tracklist: [{ position: "1", title: "Opening Track", duration: "3:00" }],
    });

    expect(mergeMissingTrackDurations(release, master).tracks[0]?.durationSec).toBe(180);
  });

  it("normalizes punctuation and trailing feature credits for same-index fallback", () => {
    const release = normalizeDiscogsRelease({
      id: 22,
      tracklist: [{ position: "A1", title: "Don't Make It Weird ft. Wednesday" }],
    });
    const master = normalizeDiscogsRelease({
      id: 23,
      tracklist: [{ position: "1", title: "Don’t Make It Weird", duration: "2:49" }],
    });

    expect(mergeMissingTrackDurations(release, master).tracks[0]?.durationSec).toBe(169);
  });

  it("does not use same-index fallback for unequal track counts", () => {
    const release = normalizeDiscogsRelease({
      id: 24,
      tracklist: [{ position: "A1", title: "Opening Track" }],
    });
    const master = normalizeDiscogsRelease({
      id: 25,
      tracklist: [
        { position: "1", title: "Opening Track", duration: "3:00" },
        { position: "2", title: "Extra Track", duration: "4:00" },
      ],
    });

    expect(mergeMissingTrackDurations(release, master).tracks[0]?.durationSec).toBeNull();
  });

  it("propagates disc numbers from heading entries", () => {
    const release = normalizeDiscogsRelease({
      id: 26,
      formats: [{ name: "CD" }],
      tracklist: [
        { type_: "heading", position: "", title: "Disc 1" },
        { position: "1", title: "First" },
        { type_: "heading", position: "", title: "Disc 2" },
        { position: "2", title: "Second" },
      ],
    });

    expect(release.tracks.map((track) => track.discNumber)).toEqual([1, 2]);
  });

  it("does not fill duration when same-index tracks are reordered", () => {
    const release = normalizeDiscogsRelease({
      id: 20,
      tracklist: [
        { position: "A1", title: "Opening Track" },
        { position: "A2", title: "Closing Track" },
      ],
    });
    const master = normalizeDiscogsRelease({
      id: 21,
      tracklist: [
        { position: "1", title: "Closing Track", duration: "3:00" },
        { position: "2", title: "Opening Track", duration: "4:00" },
      ],
    });

    expect(mergeMissingTrackDurations(release, master).tracks.map((track) => track.durationSec)).toEqual([null, null]);
  });

  it("never fills a timing from a different title sharing the same position", () => {
    const release = normalizeDiscogsRelease({ id: 1, tracklist: [{ position: "A1", title: "Single Edit" }] });
    const master = normalizeDiscogsRelease({ id: 2, tracklist: [{ position: "A1", title: "Album Version", duration: "5:00" }] });
    expect(mergeMissingTrackDurations(release, master).tracks[0]?.durationSec).toBeNull();
  });

  it("never fills a timing from a different artist sharing the same index", () => {
    const release = normalizeDiscogsRelease({ id: 1, tracklist: [{ position: "A1", title: "Duet", artists: [{ name: "Release Artist" }] }] });
    const master = normalizeDiscogsRelease({ id: 2, tracklist: [{ position: "A1", title: "Duet", artists: [{ name: "Other Artist" }], duration: "5:00" }] });
    expect(mergeMissingTrackDurations(release, master).tracks[0]?.durationSec).toBeNull();
  });

  it("identifies explicit carriers without treating EP as vinyl", () => {
    expect(derivePhysicalMediaType(["CD", "EP"])).toBe("cd");
    expect(derivePhysicalMediaType(["Cassette", "EP"])).toBe("cassette");
    expect(derivePhysicalMediaType(["Vinyl", "EP"])).toBe("vinyl");
  });

  it("parses common multi-CD positions", () => {
    expect(deriveDiscNumber("1-01")).toBe(1);
    expect(deriveDiscNumber("CD 2-01")).toBe(2);
    expect(deriveDiscNumber("Disc 3.01")).toBe(3);
  });
});

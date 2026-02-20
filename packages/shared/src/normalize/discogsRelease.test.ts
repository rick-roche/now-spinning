import { describe, expect, it } from "vitest";
import { normalizeDiscogsRelease, parseDiscogsDuration } from "./discogsRelease.js";

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
});

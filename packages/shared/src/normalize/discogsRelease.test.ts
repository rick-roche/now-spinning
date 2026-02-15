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
});

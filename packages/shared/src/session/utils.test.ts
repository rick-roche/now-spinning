import { describe, expect, it } from "vitest";
import { getPhysicalMediaBoundary, getSideFromTrack } from "./utils.js";
import type { NormalizedRelease, NormalizedTrack } from "../domain/release.js";

function track(overrides: Partial<NormalizedTrack>): NormalizedTrack {
  return {
    index: 0,
    position: "A1",
    title: "Test",
    artist: "Artist",
    durationSec: null,
    side: null,
    ...overrides,
  };
}

describe("getSideFromTrack", () => {
  it("returns null for null input", () => {
    expect(getSideFromTrack(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(getSideFromTrack(undefined)).toBeNull();
  });

  it("returns the side field when present", () => {
    expect(getSideFromTrack(track({ side: "A" }))).toBe("A");
    expect(getSideFromTrack(track({ side: "B" }))).toBe("B");
  });

  it("falls back to first letter of position when side is null", () => {
    expect(getSideFromTrack(track({ side: null, position: "A1" }))).toBe("A");
    expect(getSideFromTrack(track({ side: null, position: "B3" }))).toBe("B");
  });

  it("uppercases the position-derived side", () => {
    expect(getSideFromTrack(track({ side: null, position: "a1" }))).toBe("A");
  });

  it("returns null when position has no leading letter", () => {
    expect(getSideFromTrack(track({ side: null, position: "1" }))).toBeNull();
    expect(getSideFromTrack(track({ side: null, position: "12" }))).toBeNull();
  });

  it("trims whitespace from position before matching", () => {
    expect(getSideFromTrack(track({ side: null, position: "  B2" }))).toBe("B");
  });
});

describe("getPhysicalMediaBoundary", () => {
  function release(mediaType: NormalizedRelease["mediaType"]): Pick<NormalizedRelease, "mediaType"> {
    return { mediaType };
  }

  it("requires a flip between vinyl or cassette sides", () => {
    expect(getPhysicalMediaBoundary(release("vinyl"), track({ side: "A" }), track({ side: "B" }))).toBe("flip");
    expect(getPhysicalMediaBoundary(release("cassette"), track({ side: "A" }), track({ side: "B" }))).toBe("flip");
  });

  it("requires a disc change only between CD disc numbers", () => {
    expect(
      getPhysicalMediaBoundary(
        release("cd"),
        track({ position: "1-8", discNumber: 1 }),
        track({ position: "2-1", discNumber: 2 })
      )
    ).toBe("change-disc");
    expect(
      getPhysicalMediaBoundary(release("cd"), track({ discNumber: 1 }), track({ discNumber: 1 }))
    ).toBeNull();
  });

  it("does not infer a physical action for unknown media", () => {
    expect(getPhysicalMediaBoundary(release("unknown"), track({ side: "A" }), track({ side: "B" }))).toBeNull();
  });
});

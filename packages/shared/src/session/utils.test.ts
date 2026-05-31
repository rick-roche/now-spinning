import { describe, expect, it } from "vitest";
import { getSideFromTrack } from "./utils.js";
import type { NormalizedTrack } from "../domain/release.js";

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

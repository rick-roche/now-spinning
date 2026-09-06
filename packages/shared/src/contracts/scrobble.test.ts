import { describe, expect, it } from "vitest";
import { createDirectScrobbleTimestamps } from "./scrobble.js";

describe("direct scrobble contracts", () => {
  it("assigns ordered timestamps one second apart ending now", () => {
    expect(createDirectScrobbleTimestamps(3, 1_700_000_000)).toEqual([
      1_699_999_998,
      1_699_999_999,
      1_700_000_000,
    ]);
  });
});

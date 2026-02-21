import { describe, test, expect } from "vitest";
import {
  isEligibleToScrobble,
  getScrobbleThresholdMs,
} from "./eligibility.js";

describe("isEligibleToScrobble", () => {
  describe("with known duration", () => {
    test("returns true when threshold is met", () => {
      const durationMs = 180_000; // 3 minutes
      const thresholdPercent = 50; // 50%
      const elapsedMs = 90_000; // 1.5 minutes (50%)

      expect(isEligibleToScrobble(elapsedMs, durationMs, thresholdPercent)).toBe(true);
    });

    test("returns true when threshold is exceeded", () => {
      const durationMs = 180_000; // 3 minutes
      const thresholdPercent = 50; // 50%
      const elapsedMs = 120_000; // 2 minutes (66%)

      expect(isEligibleToScrobble(elapsedMs, durationMs, thresholdPercent)).toBe(true);
    });

    test("returns false when threshold is not met", () => {
      const durationMs = 180_000; // 3 minutes
      const thresholdPercent = 50; // 50%
      const elapsedMs = 60_000; // 1 minute (33%)

      expect(isEligibleToScrobble(elapsedMs, durationMs, thresholdPercent)).toBe(false);
    });

    test("returns true when exactly at threshold", () => {
      const durationMs = 180_000; // 3 minutes
      const thresholdPercent = 50; // 50%
      const elapsedMs = 90_000; // 1.5 minutes (exactly 50%)

      expect(isEligibleToScrobble(elapsedMs, durationMs, thresholdPercent)).toBe(true);
    });

    test("works with different threshold percentages", () => {
      const durationMs = 240_000; // 4 minutes

      // 25% threshold
      expect(isEligibleToScrobble(59_999, durationMs, 25)).toBe(false);
      expect(isEligibleToScrobble(60_000, durationMs, 25)).toBe(true);

      // 75% threshold
      expect(isEligibleToScrobble(179_999, durationMs, 75)).toBe(false);
      expect(isEligibleToScrobble(180_000, durationMs, 75)).toBe(true);

      // 100% threshold (full track)
      expect(isEligibleToScrobble(239_999, durationMs, 100)).toBe(false);
      expect(isEligibleToScrobble(240_000, durationMs, 100)).toBe(true);
    });

    test("handles very short tracks", () => {
      const durationMs = 10_000; // 10 seconds
      const thresholdPercent = 50; // 50%
      
      expect(isEligibleToScrobble(4_999, durationMs, thresholdPercent)).toBe(false);
      expect(isEligibleToScrobble(5_000, durationMs, thresholdPercent)).toBe(true);
    });

    test("handles very long tracks", () => {
      const durationMs = 1_800_000; // 30 minutes
      const thresholdPercent = 50; // 50%
      
      expect(isEligibleToScrobble(899_999, durationMs, thresholdPercent)).toBe(false);
      expect(isEligibleToScrobble(900_000, durationMs, thresholdPercent)).toBe(true);
    });
  });

  describe("with unknown duration", () => {
    test("falls back to 30 second minimum when duration is null", () => {
      const thresholdPercent = 50; // ignored when duration is null

      expect(isEligibleToScrobble(29_999, null, thresholdPercent)).toBe(false);
      expect(isEligibleToScrobble(30_000, null, thresholdPercent)).toBe(true);
      expect(isEligibleToScrobble(60_000, null, thresholdPercent)).toBe(true);
    });

    test("falls back to 30 second minimum when duration is 0", () => {
      const thresholdPercent = 50;

      expect(isEligibleToScrobble(29_999, 0, thresholdPercent)).toBe(false);
      expect(isEligibleToScrobble(30_000, 0, thresholdPercent)).toBe(true);
    });

    test("threshold percentage doesn't matter when duration is unknown", () => {
      expect(isEligibleToScrobble(30_000, null, 10)).toBe(true);
      expect(isEligibleToScrobble(30_000, null, 50)).toBe(true);
      expect(isEligibleToScrobble(30_000, null, 100)).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("returns false when elapsed is negative", () => {
      expect(isEligibleToScrobble(-1, 180_000, 50)).toBe(false);
      expect(isEligibleToScrobble(-1000, null, 50)).toBe(false);
    });

    test("handles 0% threshold (always eligible)", () => {
      expect(isEligibleToScrobble(0, 180_000, 0)).toBe(true);
      expect(isEligibleToScrobble(1, 180_000, 0)).toBe(true);
    });
  });
});

describe("getScrobbleThresholdMs", () => {
  test("calculates threshold based on percentage when duration is known", () => {
    expect(getScrobbleThresholdMs(180_000, 50)).toBe(90_000); // 50% of 3 minutes
    expect(getScrobbleThresholdMs(240_000, 25)).toBe(60_000); // 25% of 4 minutes
    expect(getScrobbleThresholdMs(120_000, 75)).toBe(90_000); // 75% of 2 minutes
    expect(getScrobbleThresholdMs(300_000, 100)).toBe(300_000); // 100% of 5 minutes
  });

  test("returns 30 seconds when duration is null", () => {
    expect(getScrobbleThresholdMs(null, 50)).toBe(30_000);
    expect(getScrobbleThresholdMs(null, 25)).toBe(30_000);
    expect(getScrobbleThresholdMs(null, 100)).toBe(30_000);
  });

  test("returns 30 seconds when duration is 0", () => {
    expect(getScrobbleThresholdMs(0, 50)).toBe(30_000);
  });

  test("handles edge case percentages", () => {
    const durationMs = 200_000;
    expect(getScrobbleThresholdMs(durationMs, 0)).toBe(0);
    expect(getScrobbleThresholdMs(durationMs, 1)).toBe(2_000);
    expect(getScrobbleThresholdMs(durationMs, 99)).toBe(198_000);
  });
});

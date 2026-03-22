import { describe, expect, it } from "vitest";
import type { NormalizedRelease } from "../domain/release.js";
import type { Session } from "../domain/session.js";
import { createSession, pauseSession, endSession } from "./engine.js";
import { syncSession } from "./sync.js";

const release: NormalizedRelease = {
  id: "123",
  title: "Test Release",
  artist: "Test Artist",
  year: 2024,
  coverUrl: null,
  tracks: [
    {
      index: 0,
      position: "A1",
      title: "First",
      artist: "Test Artist",
      durationSec: 180,
      side: "A",
    },
    {
      index: 1,
      position: "A2",
      title: "Second",
      artist: "Test Artist",
      durationSec: 200,
      side: "A",
    },
    {
      index: 2,
      position: "B1",
      title: "Third",
      artist: "Test Artist",
      durationSec: 150,
      side: "B",
    },
  ],
};

function makeSession(overrides?: Partial<Parameters<typeof createSession>[0]>): Session {
  return createSession({
    sessionId: "sess-sync",
    userId: "user-sync",
    release,
    startedAt: 1000,
    ...overrides,
  });
}

describe("syncSession", () => {
  it("returns no actions when session is paused", () => {
    const session = pauseSession(makeSession());
    const result = syncSession(session, 500_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
    expect(result.session).toBe(session);
  });

  it("returns no actions when session is ended", () => {
    const session = endSession(makeSession());
    const result = syncSession(session, 500_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
    expect(result.session).toBe(session);
  });

  it("returns no actions when current track has not reached threshold", () => {
    const session = makeSession({ startedAt: 1000 });
    const result = syncSession(session, 50_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
    expect(result.session.currentIndex).toBe(0);
    expect(result.session.tracks[0]?.status).toBe("pending");
  });

  it("scrobbles current track when elapsed exceeds threshold", () => {
    const session = makeSession({ startedAt: 1000 });
    // track 0: 180s = 180_000ms, threshold 50% = 90_000ms
    // syncAt = 1000 + 91_000 = 92_000 → elapsed = 91_000 > 90_000
    const result = syncSession(session, 92_000, 50);

    expect(result.scrobbleActions).toHaveLength(1);
    expect(result.scrobbleActions[0]).toEqual({
      trackIndex: 0,
      elapsedMs: 91_000,
      startedAt: 1000,
    });
    expect(result.session.currentIndex).toBe(1);
    expect(result.session.tracks[0]?.status).toBe("scrobbled");
    expect(result.session.tracks[1]?.status).toBe("pending");
    expect(result.session.state).toBe("running");
  });

  it("scrobbles at exact threshold boundary", () => {
    const session = makeSession({ startedAt: 1000 });
    // exactly 90_000ms elapsed = threshold
    const result = syncSession(session, 91_000, 50);

    expect(result.scrobbleActions).toHaveLength(1);
    expect(result.scrobbleActions[0]?.trackIndex).toBe(0);
  });

  it("catches up multiple tracks when backgrounded for a long time", () => {
    const session = makeSession({ startedAt: 1000 });
    // Track 0: 180s, Track 1: 200s, Track 2: 150s
    // Total duration: 530s = 530_000ms
    // syncAt far enough to cover all tracks
    const syncAt = 1000 + 600_000;
    const result = syncSession(session, syncAt, 50);

    expect(result.scrobbleActions).toHaveLength(3);
    expect(result.scrobbleActions[0]?.trackIndex).toBe(0);
    expect(result.scrobbleActions[1]?.trackIndex).toBe(1);
    expect(result.scrobbleActions[2]?.trackIndex).toBe(2);
    expect(result.session.state).toBe("ended");
  });

  it("derives next track startedAt from previous track end time", () => {
    const session = makeSession({ startedAt: 1000 });
    // Track 0: starts at 1000, duration 180_000ms → ends at 181_000
    // Track 1: should get startedAt = 181_000
    const syncAt = 1000 + 200_000;
    const result = syncSession(session, syncAt, 50);

    expect(result.scrobbleActions.length).toBeGreaterThanOrEqual(1);
    expect(result.session.tracks[1]?.startedAt).toBe(1000 + 180_000);
  });

  it("stops at a track that has not reached threshold", () => {
    const session = makeSession({ startedAt: 1000 });
    // Track 0: 180s, threshold 50% = 90s → eligible after 91_000ms
    // Track 1: starts at 181_000, 200s, threshold 50% = 100s → needs 281_000
    // syncAt covers track 0 and just the start of track 1
    const syncAt = 1000 + 185_000;
    const result = syncSession(session, syncAt, 50);

    expect(result.scrobbleActions).toHaveLength(1);
    expect(result.scrobbleActions[0]?.trackIndex).toBe(0);
    expect(result.session.currentIndex).toBe(1);
    expect(result.session.state).toBe("running");
  });

  it("skips already-scrobbled current track without action", () => {
    const session = makeSession({ startedAt: 1000 });
    const withScrobbled: Session = {
      ...session,
      tracks: session.tracks.map((t, i) =>
        i === 0 ? { ...t, status: "scrobbled" as const, scrobbledAt: 50_000 } : t
      ),
    };
    const result = syncSession(withScrobbled, 500_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
  });

  it("handles unknown duration tracks with 30s fallback", () => {
    const unknownDurationRelease: NormalizedRelease = {
      ...release,
      tracks: release.tracks.map((t) => ({ ...t, durationSec: null })),
    };
    const session = createSession({
      sessionId: "sess-unknown",
      userId: "user-unknown",
      release: unknownDurationRelease,
      startedAt: 1000,
    });

    // 30s fallback threshold; elapsed = 31_000 > 30_000
    const result = syncSession(session, 32_000, 50);

    expect(result.scrobbleActions).toHaveLength(1);
    expect(result.scrobbleActions[0]?.trackIndex).toBe(0);
  });

  it("unknown duration uses syncAt for next track startedAt", () => {
    const unknownDurationRelease: NormalizedRelease = {
      ...release,
      tracks: release.tracks.map((t) => ({ ...t, durationSec: null })),
    };
    const session = createSession({
      sessionId: "sess-unknown-2",
      userId: "user-unknown-2",
      release: unknownDurationRelease,
      startedAt: 1000,
    });

    const syncAt = 100_000;
    const result = syncSession(session, syncAt, 50);

    expect(result.scrobbleActions.length).toBeGreaterThanOrEqual(1);
    // With unknown duration, next track startedAt falls back to syncAt
    if (result.session.tracks[1]) {
      expect(result.session.tracks[1].startedAt).toBe(syncAt);
    }
  });

  it("handles track with null startedAt (not yet started)", () => {
    const session = makeSession({ startedAt: 1000 });
    const withNullStart: Session = {
      ...session,
      tracks: session.tracks.map((t, i) =>
        i === 0 ? { ...t, startedAt: null } : t
      ),
    };
    const result = syncSession(withNullStart, 500_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
  });

  it("ends session when last track is scrobbled during sync", () => {
    const twoTrackRelease: NormalizedRelease = {
      ...release,
      tracks: release.tracks.slice(0, 2),
    };
    const session = createSession({
      sessionId: "sess-end",
      userId: "user-end",
      release: twoTrackRelease,
      startedAt: 1000,
    });

    const syncAt = 1000 + 500_000;
    const result = syncSession(session, syncAt, 50);

    expect(result.scrobbleActions).toHaveLength(2);
    expect(result.session.state).toBe("ended");
  });

  it("preserves release data through sync", () => {
    const session = makeSession({ startedAt: 1000 });
    const result = syncSession(session, 500_000, 50);

    expect(result.session.release).toEqual(release);
    expect(result.session.id).toBe("sess-sync");
    expect(result.session.userId).toBe("user-sync");
  });

  it("handles single-track release", () => {
    const singleRelease: NormalizedRelease = {
      ...release,
      tracks: [release.tracks[0]!],
    };
    const session = createSession({
      sessionId: "sess-single",
      userId: "user-single",
      release: singleRelease,
      startedAt: 1000,
    });

    const syncAt = 1000 + 200_000;
    const result = syncSession(session, syncAt, 50);

    expect(result.scrobbleActions).toHaveLength(1);
    expect(result.session.state).toBe("ended");
  });

  it("handles empty release gracefully", () => {
    const emptyRelease: NormalizedRelease = {
      ...release,
      tracks: [],
    };
    const session = createSession({
      sessionId: "sess-empty",
      userId: "user-empty",
      release: emptyRelease,
      startedAt: 1000,
    });

    const result = syncSession(session, 500_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
  });

  it("respects custom threshold percentage", () => {
    const session = makeSession({ startedAt: 1000 });
    // Track 0: 180s = 180_000ms, threshold 90% = 162_000ms
    // elapsed = 100_000 < 162_000 → not eligible
    const result = syncSession(session, 101_000, 90);

    expect(result.scrobbleActions).toHaveLength(0);
    expect(result.session.currentIndex).toBe(0);
  });
});

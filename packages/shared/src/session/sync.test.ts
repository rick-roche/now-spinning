import { describe, expect, it } from "vitest";
import type { NormalizedRelease } from "../domain/release.js";
import type { Session } from "../domain/session.js";
import { createSession, endSession, pauseSession, resumeSession } from "./engine.js";
import { syncSession } from "./sync.js";

const release: NormalizedRelease = {
  id: "123",
  title: "Test Release",
  artist: "Test Artist",
  year: 2024,
  coverUrl: null,
  mediaType: "vinyl",
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

  it("excludes a long pause from active playback elapsed time", () => {
    const session = makeSession({ startedAt: 1_000 });
    const paused = pauseSession(session, 11_000);
    const resumed = resumeSession(paused, 611_000);

    const result = syncSession(resumed, 612_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
    expect(result.session.currentIndex).toBe(0);
    expect(result.session.tracks[0]?.status).toBe("pending");
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
    expect(result.session.revision).toBe(session.revision + 1);
    expect(result.scrobbleActions[0]).toEqual({
      trackIndex: 0,
      elapsedMs: 91_000,
      startedAt: 1000,
    });
    expect(result.session.currentIndex).toBe(0);
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
    const result = syncSession(withScrobbled, 100_000, 50);

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

  it("does not advance unknown-duration tracks during sync", () => {
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

    expect(result.scrobbleActions).toHaveLength(1);
    expect(result.session.currentIndex).toBe(0);
    expect(result.session.tracks[1]?.startedAt).toBeNull();
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

  it("advances a known short track as skipped when it completes", () => {
    const shortRelease: NormalizedRelease = {
      ...release,
      tracks: release.tracks.map((track, index) => ({ ...track, durationSec: index === 0 ? 10 : track.durationSec })),
    };
    const session = createSession({ sessionId: "sess-short", userId: "user-short", release: shortRelease, startedAt: 1000 });

    const result = syncSession(session, 12_000, 50);

    expect(result.scrobbleActions).toHaveLength(0);
    expect(result.session.currentIndex).toBe(1);
    expect(result.session.tracks[0]?.status).toBe("skipped");
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

describe("syncSession — pauseAtSideChange", () => {
  it("scrobbles at the threshold without completing the track", () => {
    const session = makeSession({ startedAt: 1000 });
    const result = syncSession(session, 100_000, 50, true);
    expect(result.scrobbleActions).toHaveLength(1);
    expect(result.session.state).toBe("running");
    expect(result.session.currentIndex).toBe(0);
    expect(result.session.tracks[0]?.status).toBe("scrobbled");
  });

  it("pauses at side boundary instead of advancing when pauseAtSideChange is true", () => {
    const session = makeSession({ startedAt: 1000 });
    // Track 0 (A1, 180s): eligible after 91_000ms. Track 1 (A2) same side — not a boundary.
    // syncAt covers both A tracks but not B
    const syncAt = 1000 + 400_000; // covers A1 + A2 but stops before B1 boundary if needed

    // With pauseAtSideChange = true: advances through A1→A2 (same side), then scrobbles A2,
    // detects A2→B1 boundary and pauses.
    const result = syncSession(session, syncAt, 50, true);

    expect(result.scrobbleActions).toHaveLength(2); // A1 and A2 scrobbled
    expect(result.session.state).toBe("paused");
    expect(result.session.currentIndex).toBe(1); // stayed on A2 (last of Side A)
    expect(result.session.tracks[1]?.status).toBe("scrobbled");
    expect(result.session.tracks[2]?.status).toBe("pending"); // B1 not touched
    expect(result.session.pausedAt).toBe(381_000);
  });

  it("shifts the timeline after a pause at a side boundary", () => {
    const session = makeSession({ startedAt: 1000 });
    const syncAt = 401_000;

    const paused = syncSession(session, syncAt, 50, true).session;
    const resumed = resumeSession(paused, syncAt + 600_000);

    expect(paused.pausedAt).toBe(381_000);
    expect(resumed.tracks[1]?.startedAt).toBe(801_000);
    expect(resumed.pausedAt).toBeNull();
  });

  it("without pauseAtSideChange advances through side boundary normally", () => {
    const session = makeSession({ startedAt: 1000 });
    const syncAt = 1000 + 600_000;

    const result = syncSession(session, syncAt, 50, false);

    expect(result.scrobbleActions).toHaveLength(3);
    expect(result.session.state).toBe("ended");
  });

  it("does not pause if current and next track are on the same side", () => {
    const session = makeSession({ startedAt: 1000 });
    // Only advance through A1 (side A → A2 still side A — no boundary)
    const syncAt = 1000 + 200_000; // covers A1, partially into A2

    const result = syncSession(session, syncAt, 50, true);

    expect(result.session.state).toBe("running");
    expect(result.session.currentIndex).toBe(1); // advanced to A2
    expect(result.scrobbleActions).toHaveLength(1); // only A1
  });

  it("pauseAtSideChange has no effect when session is paused", () => {
    const session = pauseSession(makeSession());
    const result = syncSession(session, 500_000, 50, true);

    expect(result.scrobbleActions).toHaveLength(0);
    expect(result.session.state).toBe("paused");
  });
});

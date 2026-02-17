import { describe, expect, it } from "vitest";
import type { NormalizedRelease } from "../domain/release.js";
import { advanceSession, createSession, pauseSession, resumeSession } from "./engine.js";

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
  ],
};

describe("session engine", () => {
  it("creates a running session with first track started", () => {
    const session = createSession({
      sessionId: "sess-1",
      userId: "user-1",
      release,
      startedAt: 1000,
    });

    expect(session.state).toBe("running");
    expect(session.currentIndex).toBe(0);
    expect(session.tracks[0]?.startedAt).toBe(1000);
  });

  it("pauses and resumes a session", () => {
    const session = createSession({
      sessionId: "sess-2",
      userId: "user-2",
      release,
      startedAt: 1000,
    });

    const paused = pauseSession(session);
    expect(paused.state).toBe("paused");

    const resumed = resumeSession(paused, 1200);
    expect(resumed.state).toBe("running");
  });

  it("advances and scrobbles the current track", () => {
    const session = createSession({
      sessionId: "sess-3",
      userId: "user-3",
      release,
      startedAt: 1000,
    });

    const advanced = advanceSession(session, 1600);

    expect(advanced.currentIndex).toBe(1);
    expect(advanced.tracks[0]?.status).toBe("scrobbled");
    expect(advanced.tracks[0]?.scrobbledAt).toBe(1600);
    expect(advanced.tracks[1]?.startedAt).toBe(1600);
  });

  it("ends the session after the last track", () => {
    const session = createSession({
      sessionId: "sess-4",
      userId: "user-4",
      release,
      startedAt: 1000,
    });

    const advancedOnce = advanceSession(session, 1600);
    const advancedTwice = advanceSession(advancedOnce, 2200);

    expect(advancedTwice.state).toBe("ended");
    expect(advancedTwice.currentIndex).toBe(1);
    expect(advancedTwice.tracks[1]?.status).toBe("scrobbled");
  });

  // Edge case tests
  describe("edge cases", () => {
    it("handles empty release gracefully", () => {
      const emptyRelease: NormalizedRelease = {
        id: "empty",
        title: "Empty",
        artist: "Nobody",
        year: 2024,
        coverUrl: null,
        tracks: [],
      };

      const session = createSession({
        sessionId: "empty-1",
        userId: "user-empty",
        release: emptyRelease,
        startedAt: 1000,
      });

      expect(session.state).toBe("running");
      expect(session.currentIndex).toBe(0);
      expect(session.tracks.length).toBe(0);

      // Advancing from empty session should end it
      const advanced = advanceSession(session, 1100);
      expect(advanced.state).toBe("ended");
    });

    it("handles single-track release", () => {
      const singleTrackRelease: NormalizedRelease = {
        id: "single",
        title: "Single",
        artist: "Solo",
        year: 2024,
        coverUrl: null,
        tracks: [
          {
            index: 0,
            position: "A1",
            title: "Only Track",
            artist: "Solo",
            durationSec: 180,
            side: "A",
          },
        ],
      };

      const session = createSession({
        sessionId: "single-1",
        userId: "user-single",
        release: singleTrackRelease,
        startedAt: 1000,
      });

      expect(session.tracks.length).toBe(1);
      expect(session.state).toBe("running");

      const advanced = advanceSession(session, 1200);
      expect(advanced.state).toBe("ended");
      expect(advanced.currentIndex).toBe(0);
      expect(advanced.tracks[0]?.status).toBe("scrobbled");
    });

    it("pauseSession is idempotent when already paused", () => {
      const session = createSession({
        sessionId: "pause-test",
        userId: "user-pause",
        release,
        startedAt: 1000,
      });

      const paused1 = pauseSession(session);
      const paused2 = pauseSession(paused1);

      expect(paused2.state).toBe("paused");
      expect(paused2.tracks).toEqual(paused1.tracks);
    });

    it("cannot resume an ended session", () => {
      const session = createSession({
        sessionId: "end-test",
        userId: "user-end",
        release,
        startedAt: 1000,
      });

      const advanced1 = advanceSession(session, 1300);
      const advanced2 = advanceSession(advanced1, 1600);
      expect(advanced2.state).toBe("ended");

      const resumed = resumeSession(advanced2, 2000);
      expect(resumed.state).toBe("ended");
    });

    it("multiple pause/resume cycles", () => {
      const session = createSession({
        sessionId: "cycle-test",
        userId: "user-cycle",
        release,
        startedAt: 1000,
      });

      const paused1 = pauseSession(session);
      expect(paused1.state).toBe("paused");

      const resumed1 = resumeSession(paused1, 1200);
      expect(resumed1.state).toBe("running");

      const paused2 = pauseSession(resumed1);
      expect(paused2.state).toBe("paused");

      const resumed2 = resumeSession(paused2, 1400);
      expect(resumed2.state).toBe("running");
      expect(resumed2.tracks[0]?.startedAt).toBe(1000); // Original start time preserved
    });

    it("advances through all tracks sequentially", () => {
      const threeTrackRelease: NormalizedRelease = {
        id: "three",
        title: "Three",
        artist: "Trio",
        year: 2024,
        coverUrl: null,
        tracks: [
          {
            index: 0,
            position: "A1",
            title: "Track 1",
            artist: "Trio",
            durationSec: 100,
            side: "A",
          },
          {
            index: 1,
            position: "A2",
            title: "Track 2",
            artist: "Trio",
            durationSec: 150,
            side: "A",
          },
          {
            index: 2,
            position: "B1",
            title: "Track 3",
            artist: "Trio",
            durationSec: 120,
            side: "B",
          },
        ],
      };

      let session = createSession({
        sessionId: "three-1",
        userId: "user-three",
        release: threeTrackRelease,
        startedAt: 1000,
      });

      expect(session.currentIndex).toBe(0);
      expect(session.tracks[0]?.status).toBe("pending");

      session = advanceSession(session, 1100);
      expect(session.currentIndex).toBe(1);
      expect(session.tracks[0]?.status).toBe("scrobbled");
      expect(session.tracks[1]?.status).toBe("pending");
      expect(session.state).toBe("running");

      session = advanceSession(session, 1250);
      expect(session.currentIndex).toBe(2);
      expect(session.tracks[1]?.status).toBe("scrobbled");
      expect(session.tracks[2]?.status).toBe("pending");

      const advanced = advanceSession(session, 1370);
      expect(advanced.state).toBe("ended");
      expect(advanced.tracks[2]?.status).toBe("scrobbled");
    });

    it("preserves start time across pause/resume", () => {
      const session = createSession({
        sessionId: "time-test",
        userId: "user-time",
        release,
        startedAt: 5000,
      });

      expect(session.tracks[0]?.startedAt).toBe(5000);

      const paused = pauseSession(session);
      const resumed = resumeSession(paused, 6000);

      // Original start time should be preserved
      expect(resumed.tracks[0]?.startedAt).toBe(5000);
    });

    it("handles advancing when current track already scrobbled", () => {
      const session = createSession({
        sessionId: "scrobble-test",
        userId: "user-scrobble",
        release,
        startedAt: 1000,
      });

      // First advance
      const advanced = advanceSession(session, 1300);
      expect(advanced.tracks[0]?.status).toBe("scrobbled");

      // The engine should handle advancing from a non-pending track
      // by just moving to next track
      expect(advanced.tracks[1]?.status).toBe("pending");
    });

    it("handles timestamps at track boundaries", () => {
      const session = createSession({
        sessionId: "boundary-test",
        userId: "user-boundary",
        release,
        startedAt: 1000,
      });

      // Advance exactly when first track ends
      const advanced = advanceSession(session, 1180);

      expect(advanced.tracks[0]?.scrobbledAt).toBe(1180);
      expect(advanced.tracks[1]?.startedAt).toBe(1180);
      expect(advanced.currentIndex).toBe(1);
    });

    it("preserves all track information through session lifecycle", () => {
      const session = createSession({
        sessionId: "info-test",
        userId: "user-info",
        release,
        startedAt: 1000,
      });

      const originalTrackInfo = {
        title: release.tracks[0]?.title,
        artist: release.tracks[0]?.artist,
        duration: release.tracks[0]?.durationSec,
      };

      const advanced1 = advanceSession(session, 1200);
      const advanced2 = advanceSession(advanced1, 1500);

      // Original track info should be in release
      expect(advanced2.release.tracks[0]?.title).toBe(originalTrackInfo.title);
      expect(advanced2.release.tracks[0]?.artist).toBe(originalTrackInfo.artist);
      expect(advanced2.release.tracks[0]?.durationSec).toBe(originalTrackInfo.duration);
    });

    it("pausing immediately on first track preserves state", () => {
      const session = createSession({
        sessionId: "pause-immediate",
        userId: "user-pause-imm",
        release,
        startedAt: 1000,
      });

      const paused = pauseSession(session);

      expect(paused.state).toBe("paused");
      expect(paused.currentIndex).toBe(0);
      expect(paused.tracks[0]?.startedAt).toBe(1000);
      expect(paused.tracks[0]?.status).toBe("pending");
    });

    it("advancing multiple times without pause moves through all tracks", () => {
      const session = createSession({
        sessionId: "continuous-advance",
        userId: "user-continuous",
        release,
        startedAt: 1000,
      });

      const adv1 = advanceSession(session, 1200);
      expect(adv1.currentIndex).toBe(1);

      const adv2 = advanceSession(adv1, 1500);
      expect(adv2.state).toBe("ended");
      expect(adv2.currentIndex).toBe(1);
      expect(adv2.tracks.every((t) => t.status === "scrobbled")).toBe(true);
    });

    it("resumed session maintains track history", () => {
      const session = createSession({
        sessionId: "history-test",
        userId: "user-history",
        release,
        startedAt: 1000,
      });

      const advanced = advanceSession(session, 1200);
      expect(advanced.tracks[0]?.scrobbledAt).toBe(1200);

      const paused = pauseSession(advanced);
      const resumed = resumeSession(paused, 1500);

      expect(resumed.tracks[0]?.scrobbledAt).toBe(1200);
      expect(resumed.tracks[0]?.status).toBe("scrobbled");
      expect(resumed.tracks[1]?.startedAt).toBe(1200);
    });

    it("session currentIndex never exceeds track count", () => {
      const session = createSession({
        sessionId: "bounds-test",
        userId: "user-bounds",
        release,
        startedAt: 1000,
      });

      const adv1 = advanceSession(session, 1200);
      const adv2 = advanceSession(adv1, 1500);

      expect(adv2.currentIndex).toBeLessThanOrEqual(adv2.tracks.length);
      expect(adv2.state).toBe("ended");
    });

    it("pausing then advancing after other session doesn't interfere", () => {
      // Create first session
      const session1 = createSession({
        sessionId: "sess-a",
        userId: "user-a",
        release,
        startedAt: 1000,
      });

      const paused1 = pauseSession(session1);

      // Create second session
      const session2 = createSession({
        sessionId: "sess-b",
        userId: "user-b",
        release,
        startedAt: 2000,
      });

      const advanced2 = advanceSession(session2, 2300);

      // Resume first session - should not be affected by second session
      const resumed1 = resumeSession(paused1, 3000);

      expect(resumed1.currentIndex).toBe(0);
      expect(advanced2.currentIndex).toBe(1);
    });
  });
});

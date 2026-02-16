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
});

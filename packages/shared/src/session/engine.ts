import type { NormalizedRelease } from "../domain/release.js";
import type { Session, SessionTrackState } from "../domain/session.js";

interface CreateSessionInput {
  sessionId: string;
  userId: string;
  release: NormalizedRelease;
  startedAt: number;
}

export function createSession(input: CreateSessionInput): Session {
  const tracks: SessionTrackState[] = input.release.tracks.map((track) => ({
    index: track.index,
    startedAt: null,
    status: "pending" as const,
    scrobbledAt: null,
  }));

  // Set startedAt for first track if it exists
  if (tracks.length > 0 && tracks[0]) {
    tracks[0] = { ...tracks[0], startedAt: input.startedAt };
  }

  return {
    id: input.sessionId,
    userId: input.userId,
    release: input.release,
    state: "running",
    pausedAt: null,
    revision: 0,
    currentIndex: 0,
    startedAt: input.startedAt,
    tracks,
  };
}

export function pauseSession(session: Session, pausedAt: number | null = null): Session {
  if (session.state !== "running") {
    return session;
  }

  return { ...session, state: "paused", pausedAt, revision: session.revision + 1 };
}

export function resumeSession(session: Session, resumedAt: number): Session {
  if (session.state === "ended") {
    return session;
  }

  const tracks = [...session.tracks];
  const pauseDuration = session.pausedAt == null ? 0 : Math.max(0, resumedAt - session.pausedAt);
  if (pauseDuration > 0) {
    for (let index = session.currentIndex; index < tracks.length; index += 1) {
      const track = tracks[index];
      if (track?.startedAt !== null && track?.startedAt !== undefined) {
        tracks[index] = { ...track, startedAt: track.startedAt + pauseDuration };
      }
    }
  }
  const current = tracks[session.currentIndex];
  if (current && current.startedAt === null) {
    tracks[session.currentIndex] = { ...current, startedAt: resumedAt };
  }

  return { ...session, state: "running", pausedAt: null, tracks, revision: session.revision + 1 };
}

export function endSession(session: Session): Session {
  if (session.state === "ended") {
    return session;
  }
  return { ...session, state: "ended", revision: session.revision + 1 };
}

export function advanceSession(session: Session, advancedAt: number, scrobbleCurrent = true): Session {
  if (session.tracks.length === 0) {
    return { ...session, state: "ended", revision: session.revision + 1 };
  }

  const tracks = [...session.tracks];
  const currentIndex = session.currentIndex;
  const current = tracks[currentIndex];

  if (current && current.status === "pending" && scrobbleCurrent) {
    tracks[currentIndex] = {
      ...current,
      status: "scrobbled",
      scrobbledAt: advancedAt,
    };
  } else if (current && current.status === "pending") {
    tracks[currentIndex] = { ...current, status: "skipped", scrobbledAt: null };
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= tracks.length) {
    return { ...session, state: "ended", tracks, revision: session.revision + 1 };
  }

  const nextTrack = tracks[nextIndex];
  if (!nextTrack) {
    return { ...session, state: "ended", tracks, revision: session.revision + 1 };
  }

  tracks[nextIndex] = {
    ...nextTrack,
    startedAt: nextTrack.startedAt ?? advancedAt,
  };

  return {
    ...session,
    currentIndex: nextIndex,
    state: "running",
    tracks,
    revision: session.revision + 1,
  };
}

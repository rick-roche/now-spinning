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
    currentIndex: 0,
    startedAt: input.startedAt,
    tracks,
  };
}

export function pauseSession(session: Session): Session {
  if (session.state !== "running") {
    return session;
  }

  return { ...session, state: "paused" };
}

export function resumeSession(session: Session, resumedAt: number): Session {
  if (session.state === "ended") {
    return session;
  }

  const tracks = [...session.tracks];
  const current = tracks[session.currentIndex];
  if (current && current.startedAt === null) {
    tracks[session.currentIndex] = { ...current, startedAt: resumedAt };
  }

  return { ...session, state: "running", tracks };
}

export function endSession(session: Session): Session {
  if (session.state === "ended") {
    return session;
  }
  return { ...session, state: "ended" };
}

export function advanceSession(session: Session, advancedAt: number): Session {
  if (session.tracks.length === 0) {
    return { ...session, state: "ended" };
  }

  const tracks = [...session.tracks];
  const currentIndex = session.currentIndex;
  const current = tracks[currentIndex];

  if (current && current.status === "pending") {
    tracks[currentIndex] = {
      ...current,
      status: "scrobbled",
      scrobbledAt: advancedAt,
    };
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= tracks.length) {
    return { ...session, state: "ended", tracks };
  }

  const nextTrack = tracks[nextIndex];
  if (!nextTrack) {
    return { ...session, state: "ended", tracks };
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
  };
}

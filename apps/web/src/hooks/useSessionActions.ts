import { useCallback, useState } from "react";
import { useApiMutation } from "./useApiMutation";
import type { Session, SessionActionResponse, SessionTrackStatus } from "@repo/shared";

function isSessionActionResponse(value: unknown): value is SessionActionResponse {
  if (!value || typeof value !== "object") return false;
  return "session" in value;
}

/**
 * Manages session actions (play, pause, skip, end) with consistent error handling.
 */
export function useSessionActions(
  session: Session | null,
  onSessionUpdate: (session: Session | null) => void
) {
  const [localError, setLocalError] = useState<string | null>(null);
  const sessionId = session?.id ?? "";
  const { mutate, loading, error, reset } = useApiMutation<SessionActionResponse, {
    action: "pause" | "resume" | "next" | "end";
  }>(
    ({ action }) => ({
      url: `/api/session/${sessionId}/${action}`,
      method: "POST",
    })
  );

  const executeAction = useCallback(
    async (action: "pause" | "resume" | "next" | "end") => {
      if (!sessionId || !session) return;

      setLocalError(null);
      const previousSession = session;

      const optimisticSession = (() => {
        if (action === "pause") {
          return { ...session, state: "paused" as const };
        }
        if (action === "resume") {
          return { ...session, state: "running" as const };
        }
        if (action === "next") {
          const nextIndex = Math.min(
            session.currentIndex + 1,
            session.release.tracks.length - 1
          );
          if (nextIndex === session.currentIndex) return session;
          const updatedTracks = session.tracks.map((track, index) =>
            index === session.currentIndex
              ? { ...track, status: "skipped" as SessionTrackStatus }
              : track
          );
          return { ...session, currentIndex: nextIndex, tracks: updatedTracks };
        }
        if (action === "end") {
          return null;
        }
        return session;
      })();

      if (optimisticSession !== session) {
        onSessionUpdate(optimisticSession);
      }

      const raw = await mutate({ action });
      if (!raw) {
        onSessionUpdate(previousSession);
        return;
      }

      if (!isSessionActionResponse(raw)) {
        setLocalError("Invalid session response");
        onSessionUpdate(previousSession);
        return;
      }

      if (raw.session?.state === "ended") {
        onSessionUpdate(null);
      } else {
        onSessionUpdate(raw.session);
      }
    },
    [mutate, onSessionUpdate, session, sessionId]
  );

  const pause = useCallback(() => executeAction("pause"), [executeAction]);
  const resume = useCallback(() => executeAction("resume"), [executeAction]);
  const next = useCallback(() => executeAction("next"), [executeAction]);
  const end = useCallback(() => executeAction("end"), [executeAction]);

  return {
    pause,
    resume,
    next,
    end,
    isLoading: loading,
    error: localError ?? error,
    clearError: () => {
      setLocalError(null);
      reset();
    },
  };
}

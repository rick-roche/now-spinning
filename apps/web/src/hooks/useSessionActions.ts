import { useCallback, useRef, useState } from "react";
import { useApiMutation } from "./useApiMutation";
import type { Session, SessionActionResponse, SessionEndMode } from "@repo/shared";

function isSessionActionResponse(value: unknown): value is SessionActionResponse {
  if (!value || typeof value !== "object") return false;
  return "session" in value;
}

/**
 * Manages session actions (play, pause, skip, end) with consistent error handling.
 */
export function useSessionActions(
  session: Session | null,
  onSessionUpdate: (session: Session | null) => void,
  recoverSession: () => Promise<Session | null>
) {
  const [localError, setLocalError] = useState<string | null>(null);
  const actionInFlight = useRef(false);
  const sessionId = session?.id ?? "";
  const { mutate, loading, error, reset } = useApiMutation<SessionActionResponse, {
    action: "pause" | "resume" | "next" | "scrobble-now" | "end";
    endMode?: SessionEndMode;
    mutationId: string;
    expectedRevision: number;
    expectedTrackIndex: number;
  }>(
    ({ action, endMode, mutationId, expectedRevision, expectedTrackIndex }) => ({
      url: `/api/session/${sessionId}/${action}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mutationId,
        expectedRevision,
        expectedTrackIndex,
        ...(action === "end" ? { endMode } : {}),
      }),
    }),
    { retry: 1 }
  );

  const executeAction = useCallback(
    async (action: "pause" | "resume" | "next" | "scrobble-now" | "end", endMode?: SessionEndMode): Promise<boolean> => {
      if (!sessionId || !session || actionInFlight.current) return false;
      actionInFlight.current = true;

      setLocalError(null);
      try {
        const raw = await mutate({
          action,
          mutationId: crypto.randomUUID(),
          expectedRevision: session.revision,
          expectedTrackIndex: session.currentIndex,
          ...(endMode ? { endMode } : {}),
        });
        if (!raw) { await recoverSession(); return false; }
        if (!isSessionActionResponse(raw)) {
          setLocalError("Invalid session response");
          await recoverSession();
          return false;
        }
        onSessionUpdate(raw.session);
        return true;
      } catch (caught) {
        await recoverSession();
        setLocalError(caught instanceof Error ? caught.message : "Session action failed");
        return false;
      } finally {
        actionInFlight.current = false;
      }
    },
    [mutate, onSessionUpdate, recoverSession, session, sessionId]
  );

  const pause = useCallback(() => executeAction("pause"), [executeAction]);
  const resume = useCallback(() => executeAction("resume"), [executeAction]);
  const next = useCallback(() => executeAction("next"), [executeAction]);
  const scrobbleNow = useCallback(() => executeAction("scrobble-now"), [executeAction]);
  const end = useCallback((endMode: SessionEndMode) => executeAction("end", endMode), [executeAction]);

  return {
    pause,
    resume,
    next,
    scrobbleNow,
    end,
    isLoading: loading,
    error: localError ?? error,
    clearError: () => {
      setLocalError(null);
      reset();
    },
  };
}

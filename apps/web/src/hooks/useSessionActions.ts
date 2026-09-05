import { useCallback, useRef, useState } from "react";
import { useApiMutation } from "./useApiMutation";
import type { Session, SessionActionResponse } from "@repo/shared";

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
    action: "pause" | "resume" | "next" | "end";
    mutationId: string;
    expectedRevision: number;
    expectedTrackIndex: number;
  }>(
    ({ action, mutationId, expectedRevision, expectedTrackIndex }) => ({
      url: `/api/session/${sessionId}/${action}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mutationId,
        expectedRevision,
        expectedTrackIndex,
      }),
    }),
    { retry: 1 }
  );

  const executeAction = useCallback(
    async (action: "pause" | "resume" | "next" | "end"): Promise<boolean> => {
      if (!sessionId || !session || actionInFlight.current) return false;
      actionInFlight.current = true;

      setLocalError(null);
      try {
        const raw = await mutate({
          action,
          mutationId: crypto.randomUUID(),
          expectedRevision: session.revision,
          expectedTrackIndex: session.currentIndex,
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

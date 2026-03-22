import { useCallback, useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";
import type { Session, SessionSyncResponse } from "@repo/shared";

function isSessionSyncResponse(value: unknown): value is SessionSyncResponse {
  if (!value || typeof value !== "object") return false;
  return "session" in value && "scrobbledCount" in value;
}

interface UseVisibilityResumeOptions {
  /** Callback when sync succeeds — receives the server-authoritative session */
  onSync: (session: Session, scrobbledCount: number) => void;
  /** Callback on sync error */
  onError?: (error: string) => void;
}

/**
 * Calls the server sync endpoint when the page returns to foreground.
 *
 * On iOS PWAs, timers freeze when the app is backgrounded. This hook
 * listens for `visibilitychange` and asks the server to catch up on
 * any missed scrobbles / track advances, then hands the authoritative
 * session back to the caller.
 */
export function useVisibilityResume(
  sessionId: string | null,
  isRunning: boolean,
  options: UseVisibilityResumeOptions
) {
  const syncingRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const isRunningRef = useRef(isRunning);
  const optionsRef = useRef(options);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const sync = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || !isRunningRef.current || syncingRef.current) return;

    syncingRef.current = true;

    try {
      const response = await apiFetch(`/api/session/${id}/sync`, {
        method: "POST",
      });

      if (!response.ok) {
        let message = `Sync failed (${response.status})`;
        try {
          const body: { error?: { message?: string } } = await response.json();
          message = body.error?.message ?? message;
        } catch {
          // Ignore JSON parse error
        }
        optionsRef.current.onError?.(message);
        return;
      }

      const json: unknown = await response.json();
      if (isSessionSyncResponse(json)) {
        optionsRef.current.onSync(json.session, json.scrobbledCount);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync request failed";
      optionsRef.current.onError?.(message);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sync]);
}

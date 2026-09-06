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
  _isRunning: boolean,
  options: UseVisibilityResumeOptions
) {
  const syncingRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const optionsRef = useRef(options);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const sync = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || syncingRef.current) return;

    syncingRef.current = true;

    try {
      const response = await apiFetch(`/api/session/${id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (!response.ok) {
        let message = `Sync failed (${response.status})`;
        try {
          const body = (await response.json()) as unknown as { error?: { message?: string } };
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
      void sync();
    };
    const handlePageShow = () => {
      void sync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    void sync();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [sync]);

  useEffect(() => {
    if (sessionId && document.visibilityState === "visible") {
      void sync();
    }
  }, [sessionId, sync]);
}

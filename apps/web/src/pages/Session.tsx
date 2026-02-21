import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { SideCompletionModal } from "../components/SideCompletionModal";
import { apiFetch } from "../lib/api";
import { getScrobbleDelay, getNotifyOnSideCompletion } from "../lib/settings";
import { getScrobbleThresholdMs } from "@repo/shared";
import type { APIError, Session, SessionActionResponse, SessionCurrentResponse } from "@repo/shared";

function isSessionCurrentResponse(value: unknown): value is SessionCurrentResponse {
  if (!value || typeof value !== "object") return false;
  return "session" in value;
}

function isSessionActionResponse(value: unknown): value is SessionActionResponse {
  if (!value || typeof value !== "object") return false;
  return "session" in value;
}

export function SessionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showSideCompletionModal, setShowSideCompletionModal] = useState(false);
  const [sideCompletionInfo, setSideCompletionInfo] = useState<{
    currentSide: string;
    nextSide: string;
    currentTitle: string;
    nextTitle: string;
  } | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const scrobbleTimerRef = useRef<number | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const localElapsedRef = useRef(0);
  const localStartRef = useRef<number | null>(null);
  const lastTrackKeyRef = useRef<string | null>(null);
  const storageKeyRef = useRef<string | null>(null);
  const scrobbledTracksRef = useRef<Set<string>>(new Set());

  const getSideFromTrack = useCallback((track: Session["release"]["tracks"][number] | undefined) => {
    if (!track) return null;
    if (track.side) return track.side;
    const match = track.position?.trim().match(/^[A-Za-z]/);
    return match ? match[0].toUpperCase() : null;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        const response = await apiFetch("/api/session/current", { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Failed to load session");
        }
        const raw: unknown = await response.json();
        if (!isSessionCurrentResponse(raw)) {
          throw new Error("Invalid session response");
        }
        setSession(raw.session?.state === "ended" ? null : raw.session);
      } catch (err) {
        if (controller.signal.aborted) return;
        const error: unknown = err;
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session || session.state !== "running") return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  const currentTrack = useMemo(() => {
    if (!session) return null;
    return session.release.tracks[session.currentIndex] ?? null;
  }, [session]);

  const elapsedMs = useMemo(() => {
    if (!session) return 0;
    return (
      localElapsedRef.current +
      (localStartRef.current ? nowMs - localStartRef.current : 0)
    );
  }, [nowMs, session]);

  const durationSec = currentTrack?.durationSec ?? null;
  const durationMs = durationSec && durationSec > 0 ? durationSec * 1000 : null;
  const progressPct = durationMs
    ? Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100))
    : 0;

  const formatTime = (valueMs: number | null) => {
    if (valueMs === null) return "--:--";
    const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleScrobbleCurrent = useCallback(
    async (elapsedMs: number, thresholdPercent: number) => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;

      const trackKey = `${currentSession.id}:${currentSession.currentIndex}`;
      if (scrobbledTracksRef.current.has(trackKey)) {
        return; // Already scrobbled this track
      }

      try {
        const response = await apiFetch(`/api/session/${currentSession.id}/scrobble-current`, {
          method: "POST",
          body: JSON.stringify({ elapsedMs, thresholdPercent }),
        });
        if (response.ok) {
          scrobbledTracksRef.current.add(trackKey);
          const raw: unknown = await response.json();
          if (isSessionActionResponse(raw)) {
            setSession(raw.session);
          }
        }
      } catch {
        // Silently handle errors
      }
    },
    [] // No dependencies - uses sessionRef
  );

  // Auto-pause on unmount if session is still running
  useEffect(() => {
    return () => {
      const currentSession = sessionRef.current;
      if (currentSession && currentSession.state === "running") {
        // Fire and forget - pause the session
        void apiFetch(`/api/session/${currentSession.id}/pause`, { method: "POST" });
      }
    };
  }, []);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const handleAction = useCallback(
    async (action: "pause" | "resume" | "next" | "end") => {
      if (!session) return;

      try {
        setError(null);
        const response = await apiFetch(`/api/session/${session.id}/${action}`, {
          method: "POST",
        });
        if (!response.ok) {
          let message = "Session action failed";
          try {
            const data: APIError = await response.json();
            message = data.error?.message ?? message;
          } catch {
            // ignore JSON parse error on non-JSON error responses
          }
          throw new Error(message);
        }
        const raw: unknown = await response.json();
        if (!isSessionActionResponse(raw)) {
          throw new Error("Invalid session response");
        }
        if (raw.session?.state === "ended") {
          setSession(null);
        } else {
          setSession(raw.session);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [session]
  );

  const getSideCompletionInfo = useCallback(() => {
    if (!session) return null;
    const current = session.release.tracks[session.currentIndex];
    const next = session.release.tracks[session.currentIndex + 1];
    if (!current || !next) return null;

    const currentSide = getSideFromTrack(current);
    const nextSide = getSideFromTrack(next);
    if (!currentSide || !nextSide || currentSide === nextSide) return null;

    return {
      currentSide,
      nextSide,
      currentTitle: current.title || "Unknown",
      nextTitle: next.title || "Unknown",
    };
  }, [getSideFromTrack, session]);

  const handleNext = useCallback(async () => {
    if (!session) return;

    const info = getSideCompletionInfo();
    if (info && getNotifyOnSideCompletion()) {
      setSideCompletionInfo(info);
      setShowSideCompletionModal(true);
      if (session.state === "running") {
        await handleAction("pause");
      }
      return;
    }

    await handleAction("next");
  }, [getSideCompletionInfo, handleAction, session]);

  const handleSideCompletionContinue = useCallback(async () => {
    setShowSideCompletionModal(false);
    setSideCompletionInfo(null);
    await handleAction("next");
  }, [handleAction]);

  const handleSideCompletionPause = useCallback(() => {
    setShowSideCompletionModal(false);
  }, []);

  useEffect(() => {
    if (!session) return;

    const trackKey = `${session.id}:${session.currentIndex}`;
    if (lastTrackKeyRef.current !== trackKey) {
      lastTrackKeyRef.current = trackKey;
      storageKeyRef.current = `now-spinning:session-timer:${trackKey}`;
      
      // Clear scrobble timer when changing tracks
      if (scrobbleTimerRef.current !== null) {
        window.clearTimeout(scrobbleTimerRef.current);
        scrobbleTimerRef.current = null;
      }

      try {
        const stored = sessionStorage.getItem(storageKeyRef.current);
        if (stored) {
          const data = JSON.parse(stored) as {
            elapsedMs: number;
            running: boolean;
            updatedAt: number;
          };
          const safeElapsed = Number.isFinite(data.elapsedMs) ? data.elapsedMs : 0;
          const safeUpdatedAt = Number.isFinite(data.updatedAt) ? data.updatedAt : Date.now();
          const wasRunning = data.running === true;

          if (session.state === "running") {
            const carriedElapsed = wasRunning
              ? safeElapsed + Math.max(0, Date.now() - safeUpdatedAt)
              : safeElapsed;
            localElapsedRef.current = carriedElapsed;
            localStartRef.current = Date.now();
          } else {
            localElapsedRef.current = safeElapsed;
            localStartRef.current = null;
          }
        } else {
          localElapsedRef.current = 0;
          localStartRef.current = session.state === "running" ? Date.now() : null;
        }
      } catch {
        localElapsedRef.current = 0;
        localStartRef.current = session.state === "running" ? Date.now() : null;
      }
      return;
    }

    if (session.state === "paused" && localStartRef.current !== null) {
      localElapsedRef.current += Date.now() - localStartRef.current;
      localStartRef.current = null;
    }

    if (session.state === "running" && localStartRef.current === null) {
      localStartRef.current = Date.now();
    }
  }, [session]);

  useEffect(() => {
    if (!session || !storageKeyRef.current) return;

    const currentElapsed =
      localElapsedRef.current +
      (localStartRef.current ? Date.now() - localStartRef.current : 0);

    try {
      sessionStorage.setItem(
        storageKeyRef.current,
        JSON.stringify({
          elapsedMs: currentElapsed,
          running: session.state === "running" && localStartRef.current !== null,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // ignore
    }
  }, [nowMs, session]);

  useEffect(() => {
    if (!session) return;

    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    if (session.state !== "running") return;

    const durationSec = session.release.tracks[session.currentIndex]?.durationSec;
    if (!durationSec || durationSec <= 0) return;

    const elapsedMs =
      localElapsedRef.current +
      (localStartRef.current ? Date.now() - localStartRef.current : 0);
    const remainingMs = durationSec * 1000 - elapsedMs;

    if (remainingMs <= 0) {
      void handleNext();
      return;
    }

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      void handleNext();
    }, remainingMs);

    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [session, handleNext]);

  const trackIdentifier = useMemo(
    () => (session ? `${session.id}:${session.currentIndex}` : null),
    [session]
  );

  // Scrobble threshold timer - only rerun when track changes, not every second
  useEffect(() => {
    if (!sessionRef.current) return;
    if (sessionRef.current.state !== "running") return;

    // Clear any existing scrobble timer
    if (scrobbleTimerRef.current !== null) {
      window.clearInterval(scrobbleTimerRef.current);
      scrobbleTimerRef.current = null;
    }

    const trackKey = `${sessionRef.current.id}:${sessionRef.current.currentIndex}`;
    if (scrobbledTracksRef.current.has(trackKey)) {
      return; // Already scrobbled
    }

    const currentTrack = sessionRef.current.release.tracks[sessionRef.current.currentIndex];
    if (!currentTrack) return;

    const durationSec = currentTrack.durationSec;
    const durationMs = durationSec && durationSec > 0 ? durationSec * 1000 : null;
    
    const thresholdPercent = getScrobbleDelay();
    const thresholdMs = getScrobbleThresholdMs(durationMs, thresholdPercent);
    
    if (!thresholdMs) return;

    // Set up a recurring check every 100ms to see if we've hit the threshold
    // This way we don't depend on nowMs and avoid re-triggering the effect
    const intervalHandle = window.setInterval(() => {
      const currentSession = sessionRef.current;
      if (!currentSession || currentSession.state !== "running") {
        window.clearInterval(intervalHandle);
        return;
      }

      const elapsedMs =
        localElapsedRef.current +
        (localStartRef.current ? Date.now() - localStartRef.current : 0);

      const trackKey2 = `${currentSession.id}:${currentSession.currentIndex}`;
      if (scrobbledTracksRef.current.has(trackKey2)) {
        window.clearInterval(intervalHandle);
        return;
      }

      const currentTrack2 = currentSession.release.tracks[currentSession.currentIndex];
      if (!currentTrack2) return;

      const durationSec2 = currentTrack2.durationSec;
      const durationMs2 = durationSec2 && durationSec2 > 0 ? durationSec2 * 1000 : null;
      const thresholdMs2 = getScrobbleThresholdMs(durationMs2, thresholdPercent);

      if (!thresholdMs2) return;

      if (elapsedMs >= thresholdMs2) {
        void handleScrobbleCurrent(elapsedMs, thresholdPercent);
        window.clearInterval(intervalHandle);
      }
    }, 100);

    scrobbleTimerRef.current = intervalHandle;

    return () => {
      window.clearInterval(intervalHandle);
    };
  }, [trackIdentifier, handleScrobbleCurrent]); // Re-run when track changes

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Icon name="sync" className="text-4xl text-primary animate-spin mb-2" />
          <p className="text-sm text-slate-500">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
            <Icon name="album" className="text-4xl" />
          </div>
          <h2 className="text-2xl font-bold mb-2">No active session</h2>
          <p className="text-slate-500 dark:text-primary/60 mb-6">
            Pick a release to start listening.
          </p>
          <Link
            to="/collection"
            className="inline-block bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20"
          >
            Browse Collection
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <button className="flex items-center justify-center size-10 rounded-full hover:bg-white/10 transition-colors invisible">
          <Icon name="expand_more" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
            Now Playing
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-[10px] uppercase tracking-widest opacity-60">
              Syncing to Last.fm
            </span>
          </div>
        </div>
        <button className="flex items-center justify-center size-10 rounded-full hover:bg-white/10 transition-colors invisible">
          <Icon name="more_vert" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pb-32 md:pb-12">
        <div className="md:grid md:grid-cols-[1fr_1fr] md:gap-12 md:max-w-4xl md:mx-auto md:items-start">
        {/* Left column on desktop: album art + track info + progress + controls */}
        <div>
        {/* Album Art */}
        <div className="mt-4 flex justify-center">
          <div className="relative group aspect-square w-full max-w-[220px] md:max-w-sm">
            <div className="absolute inset-0 bg-black/40 rounded-xl translate-y-4 scale-95 blur-2xl"></div>
            <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl">
              {session.release.coverUrl ? (
                <img
                  alt="Album Art"
                  className="w-full h-full object-cover"
                  src={session.release.coverUrl}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-accent-dark/50">
                  <Icon name="album" className="text-6xl text-text-muted" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Track Info */}
        <div className="mt-10 text-center">
          <p className="text-primary font-bold text-sm tracking-widest uppercase mb-1">
            {currentTrack?.position || "—"}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {currentTrack?.title || "Unknown Track"}
          </h1>
          <p className="text-lg opacity-60 mt-1 font-medium">{session.release.artist}</p>
        </div>

        {/* Progress Slider */}
        {durationMs ? (
          <div className="mt-8 px-2">
            <div className="relative w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-3 text-[11px] font-medium tracking-tighter opacity-50 uppercase">
              <span>{formatTime(elapsedMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </div>
        ) : (
          <div className="mt-8 px-2 text-center">
            <p className="text-xs text-slate-500">Duration unknown</p>
          </div>
        )}

        {/* Session Controls */}
        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            onClick={() => void handleNext()}
            className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          >
            <Icon name="skip_next" className="text-white/80" />
            <span className="text-[10px] uppercase font-bold tracking-widest">Skip Track</span>
          </button>
          <button
            onClick={() => void handleAction(session.state === "paused" ? "resume" : "pause")}
            className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl bg-primary text-white border border-primary/20 hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            <Icon name={session.state === "paused" ? "play_arrow" : "pause"} />
            <span className="text-[10px] uppercase font-bold tracking-widest">
              {session.state === "paused" ? "Resume" : "Pause Scrobble"}
            </span>
          </button>
          <button
            onClick={() => void handleAction("end")}
            className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
          >
            <Icon name="stop" />
            <span className="text-[10px] uppercase font-bold tracking-widest">Stop Session</span>
          </button>
        </div>
        </div>{/* end left column */}

        {/* Right column on desktop / continuation on mobile: upcoming tracks */}
        <div className="mt-12 md:mt-4">
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-xs uppercase font-bold tracking-[0.2em] opacity-40">
              Coming up
            </h3>
          </div>
          <div className="space-y-2">
            {session.release.tracks
              .slice(session.currentIndex, session.currentIndex + 4)
              .map((track, idx) => {
                const isCurrent = idx === 0;
                return (
                  <div
                    key={track.position}
                    className={`flex items-center gap-4 p-3 rounded-lg ${
                      isCurrent
                        ? "border border-primary/30 bg-primary/5"
                        : "hover:bg-white/5 transition-colors"
                    }`}
                  >
                    <span
                      className={`text-xs font-bold w-6 ${
                        isCurrent ? "text-primary" : "opacity-30"
                      }`}
                    >
                      {track.position}
                    </span>
                    <div className="flex-1">
                      <p className={`text-sm ${isCurrent ? "font-bold" : "font-medium opacity-80"}`}>
                        {track.title}
                      </p>
                      {isCurrent && <p className="text-[10px] opacity-50">Playing now</p>}
                    </div>
                    {isCurrent ? (
                      <Icon name="graphic_eq" className="text-primary text-lg" />
                    ) : track.durationSec ? (
                      <span className="text-[10px] opacity-40">{formatTime(track.durationSec * 1000)}</span>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>{/* end right column */}
        </div>{/* end desktop grid */}
      </main>

      {error && (
        <div className="fixed bottom-24 left-0 right-0 mx-auto max-w-md px-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}

      {sideCompletionInfo && (
        <SideCompletionModal
          currentSide={sideCompletionInfo.currentSide}
          nextSide={sideCompletionInfo.nextSide}
          currentTrackTitle={sideCompletionInfo.currentTitle}
          nextTrackTitle={sideCompletionInfo.nextTitle}
          isOpen={showSideCompletionModal}
          onContinue={handleSideCompletionContinue}
          onPause={handleSideCompletionPause}
        />
      )}
    </>
  );
}

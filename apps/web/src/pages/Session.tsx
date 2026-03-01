import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { SessionControls } from "../components/SessionControls";
import { SessionProgress } from "../components/SessionProgress";
import { SessionTrackInfo } from "../components/SessionTrackInfo";
import { SideCompletionModal } from "../components/SideCompletionModal";
import { ErrorMessage } from "../components/ErrorMessage";
import { SessionSkeleton } from "../components/SessionSkeleton";
import { getNotifyOnSideCompletion } from "../lib/settings";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { useSessionTimer } from "../hooks/useSessionTimer";
import { useAutoAdvance } from "../hooks/useAutoAdvance";
import { useScrobbleScheduler } from "../hooks/useScrobbleScheduler";
import { useSessionActions } from "../hooks/useSessionActions";
import type { Session, SessionCurrentResponse } from "@repo/shared";

function isSessionCurrentResponse(value: unknown): value is SessionCurrentResponse {
  if (!value || typeof value !== "object") return false;
  return "session" in value;
}

export function SessionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [showSideCompletionModal, setShowSideCompletionModal] = useState(false);
  const [sideCompletionInfo, setSideCompletionInfo] = useState<{
    currentSide: string;
    nextSide: string;
    currentTitle: string;
    nextTitle: string;
  } | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const {
    data: currentResponse,
    loading,
    error: loadError,
    refetch,
  } = useApiQuery<SessionCurrentResponse>("/api/session/current", {
    errorMessage: "Failed to load session",
    retry: 0,
  });

  // Sync session state from API response
  useEffect(() => {
    if (!currentResponse) {
      return;
    }

    if (!isSessionCurrentResponse(currentResponse)) {
      // Invalid response structure shouldn't happen in normal operation
      return;
    }

    const newSession = currentResponse.session?.state === "ended" ? null : currentResponse.session;
    setSession(newSession);
  }, [currentResponse]);

  // Keep sessionRef in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const currentTrack = useMemo(() => {
    if (!session) return null;
    return session.release.tracks[session.currentIndex] ?? null;
  }, [session]);

  const previousTrack = useMemo(() => {
    if (!session || session.currentIndex === 0) return null;
    return session.release.tracks[session.currentIndex - 1] ?? null;
  }, [session]);

  const durationMs = currentTrack?.durationSec && currentTrack.durationSec > 0
    ? currentTrack.durationSec * 1000
    : null;

  const isRunning = session?.state === "running";

  // Use custom hooks
  const { elapsedMs, formatTime } = useSessionTimer(
    session?.id ?? null,
    session?.currentIndex ?? 0,
    isRunning
  );

  const sessionActions = useSessionActions(session, setSession);
  const pauseRef = useRef(sessionActions.pause);

  // Keep pause ref up to date
  useEffect(() => {
    pauseRef.current = sessionActions.pause;
  }, [sessionActions.pause]);

  // Auto-pause on unmount if session is still running
  useEffect(() => {
    return () => {
      const currentSession = sessionRef.current;
      if (currentSession && currentSession.state === "running") {
        void pauseRef.current();
      }
    };
  }, []);

  const { mutate: scrobbleCurrent } = useApiMutation<
    SessionCurrentResponse,
    { sessionId: string; elapsedMs: number; thresholdPercent: number }
  >((vars) => ({
    url: `/api/session/${vars.sessionId}/scrobble-current`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      elapsedMs: vars.elapsedMs,
      thresholdPercent: vars.thresholdPercent,
    }),
  }));

  const handleScrobbleCurrent = useCallback(
    async (elapsedMs: number, thresholdPercent: number) => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;

      const raw = await scrobbleCurrent({
        sessionId: currentSession.id,
        elapsedMs,
        thresholdPercent,
      });

      if (raw && isSessionCurrentResponse(raw)) {
        setSession(raw.session);
      }
    },
    [scrobbleCurrent]
  );

  useScrobbleScheduler(
    session?.id ?? null,
    session?.currentIndex ?? 0,
    isRunning,
    durationMs,
    elapsedMs,
    handleScrobbleCurrent
  );

  const getSideFromTrack = useCallback((track: Session["release"]["tracks"][number] | undefined) => {
    if (!track) return null;
    if (track.side) return track.side;
    const match = track.position?.trim().match(/^[A-Za-z]/);
    return match ? match[0].toUpperCase() : null;
  }, []);

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
    const info = getSideCompletionInfo();
    if (info && getNotifyOnSideCompletion()) {
      setSideCompletionInfo(info);
      setShowSideCompletionModal(true);
      if (session?.state === "running") {
        await sessionActions.pause();
      }
      return;
    }

    await sessionActions.next();
  }, [getSideCompletionInfo, session, sessionActions]);

  useAutoAdvance(
    isRunning,
    durationMs,
    elapsedMs,
    handleNext
  );

  const handleSideCompletionContinue = useCallback(async () => {
    setShowSideCompletionModal(false);
    setSideCompletionInfo(null);
    await sessionActions.next();
  }, [sessionActions]);

  const handleSideCompletionPause = useCallback(() => {
    setShowSideCompletionModal(false);
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (session?.state === "running") {
      await sessionActions.pause();
    } else {
      await sessionActions.resume();
    }
  }, [session, sessionActions]);

  const canSkipForward = session
    ? session.currentIndex < session.release.tracks.length - 1
    : false;

  const handleSkipBack = () => {
    // Skip back not implemented yet - would require API endpoint
  };

  const progressPct = durationMs
    ? Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100))
    : 0;

  const errorMessage = loadError ?? sessionActions.error;

  if (loading) {
    return <SessionSkeleton />;
  }

  if (errorMessage && !session) {
    return (
      <ErrorMessage
        fullPage
        message={errorMessage}
        onRetry={() => void refetch()}
      />
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
            className="inline-block bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-primary/20 focus-ring"
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
        <div className="w-10" aria-hidden="true" />
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
            Now Playing
          </span>
          <div className="flex items-center gap-1.5 mt-0.5" role="status" aria-live="polite">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-[10px] uppercase tracking-widest opacity-60">
              Syncing to Last.fm
            </span>
          </div>
        </div>
        <div className="w-10" aria-hidden="true" />
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pb-32 md:pb-12">
        <div className="md:grid md:grid-cols-[1fr_1fr] md:gap-12 md:max-w-4xl md:mx-auto md:items-start">
          {/* Left column: album art, track info, progress, controls */}
          <div>
            {currentTrack && (
              <SessionTrackInfo track={currentTrack} release={session.release} />
            )}

            {previousTrack && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-bold mb-2">
                  Recently played
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold opacity-40 w-8 shrink-0">
                    {previousTrack.position}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{previousTrack.title}</p>
                    <p className="text-[11px] opacity-50 truncate">
                      {previousTrack.artist || session.release.artist}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8">
              <SessionProgress
                elapsedMs={elapsedMs}
                durationMs={durationMs}
                progressPercent={progressPct}
                formatTime={formatTime}
              />
            </div>

            <div className="mt-8">
              <SessionControls
                isPaused={session.state === "paused"}
                canSkipBack={false}
                canSkipForward={canSkipForward}
                onPlayPause={() => void handlePlayPause()}
                onSkipBack={handleSkipBack}
                onSkipForward={() => void handleNext()}
                onEnd={() => void sessionActions.end()}
                disabled={sessionActions.isLoading}
              />
            </div>
          </div>

          {/* Right column: upcoming tracks */}
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
                        className={`text-xs font-bold w-6 shrink-0 ${
                          isCurrent ? "text-primary" : "opacity-30"
                        }`}
                      >
                        {track.position}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isCurrent ? "font-bold" : "font-medium opacity-80"}`}>
                          {track.title}
                        </p>
                        {isCurrent && <p className="text-[10px] opacity-50">Playing now</p>}
                      </div>
                      {isCurrent ? (
                        <Icon name="graphic_eq" className="text-primary text-lg shrink-0" />
                      ) : track.durationSec ? (
                        <span className="text-[10px] opacity-40 shrink-0">{formatTime(track.durationSec * 1000)}</span>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </main>

      {errorMessage && (
        <div className="fixed bottom-24 left-0 right-0 mx-auto max-w-md px-4">
          <ErrorMessage message={errorMessage} />
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

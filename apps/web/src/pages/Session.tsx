import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { getApiUrl } from "../lib/api";
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
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const localElapsedRef = useRef(0);
  const localStartRef = useRef<number | null>(null);
  const lastTrackKeyRef = useRef<string | null>(null);
  const storageKeyRef = useRef<string | null>(null);

  const loadSession = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl("/api/session/current"));
      if (!response.ok) {
        throw new Error("Failed to load session");
      }
      const raw: unknown = await response.json();
      if (!isSessionCurrentResponse(raw)) {
        throw new Error("Invalid session response");
      }
      setSession(raw.session);
    } catch (err) {
       
      const error: unknown = err;
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (!session) return;
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

  const handleAction = useCallback(
    async (action: "pause" | "resume" | "next" | "end") => {
      if (!session) return;

      try {
        setError(null);
        const response = await fetch(getApiUrl(`/api/session/${session.id}/${action}`), {
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
        setError((err as Error).message);
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;

    const trackKey = `${session.id}:${session.currentIndex}`;
    if (lastTrackKeyRef.current !== trackKey) {
      lastTrackKeyRef.current = trackKey;
      storageKeyRef.current = `now-spinning:session-timer:${trackKey}`;

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
      void handleAction("next");
      return;
    }

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      void handleAction("next");
    }, remainingMs);

    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [session, handleAction]);

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
            onClick={() => void handleAction("next")}
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
    </>
  );
}

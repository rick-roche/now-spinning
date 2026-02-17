import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Text,
} from "@radix-ui/themes";
import type { Session, SessionActionResponse, SessionCurrentResponse } from "@repo/shared";

function isSessionCurrentResponse(value: unknown): value is SessionCurrentResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "session" in value;
}

function isSessionActionResponse(value: unknown): value is SessionActionResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "session" in value;
}

export function SessionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [devMode, setDevMode] = useState<boolean>(false);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const localElapsedRef = useRef(0);
  const localStartRef = useRef<number | null>(null);
  const lastTrackKeyRef = useRef<string | null>(null);
  const storageKeyRef = useRef<string | null>(null);

  const loadSession = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/session/current");
      if (!response.ok) {
        throw new Error("Failed to load session");
      }
      const raw: unknown = await response.json();
      if (!isSessionCurrentResponse(raw)) {
        throw new Error("Invalid session response");
      }
      setSession(raw.session);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
    
    // Check dev mode
    fetch("/api/health")
      .then((res) => res.json())
      .then((data: { devMode?: boolean }) => {
        setDevMode(data.devMode === true);
      })
      .catch(() => {
        // Ignore health check errors
      });
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [session]);

  const currentTrack = useMemo(() => {
    if (!session) {
      return null;
    }
    return session.release.tracks[session.currentIndex] ?? null;
  }, [session]);

  const elapsedMs = useMemo(() => {
    if (!session) {
      return 0;
    }
    return (
      localElapsedRef.current +
      (localStartRef.current ? nowMs - localStartRef.current : 0)
    );
  }, [nowMs, session]);

  const durationSec = currentTrack?.durationSec ?? null;
  const durationMs = durationSec && durationSec > 0 ? durationSec * 1000 : null;
  const remainingMs = durationMs ? Math.max(0, durationMs - elapsedMs) : null;
  const progressPct = durationMs
    ? Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100))
    : 0;

  const formatTime = (valueMs: number | null) => {
    if (valueMs === null) {
      return "--:--";
    }
    const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleAction = useCallback(async (action: "pause" | "resume" | "next") => {
    if (!session) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/session/${session.id}/${action}`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: { message?: string } };
        throw new Error(data.error?.message ?? "Session action failed");
      }
      const raw: unknown = await response.json();
      if (!isSessionActionResponse(raw)) {
        throw new Error("Invalid session response");
      }
      setSession(raw.session);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const trackKey = `${session.id}:${session.currentIndex}`;
    if (lastTrackKeyRef.current !== trackKey) {
      lastTrackKeyRef.current = trackKey;
      storageKeyRef.current = `now-spinning:session-timer:${trackKey}`;

      // Try to restore timing from sessionStorage
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
    if (!session || !storageKeyRef.current) {
      return;
    }

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
      // ignore write failures
    }
  }, [nowMs, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    if (session.state !== "running") {
      return;
    }

    const durationSec = session.release.tracks[session.currentIndex]?.durationSec;
    if (!durationSec || durationSec <= 0) {
      return;
    }

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

  return (
    <Flex direction="column" gap="4">
      <Button asChild size="2" variant="soft">
        <Link to="/search">Back to Search</Link>
      </Button>

      {loading ? (
        <Flex gap="2" align="center">
          <Spinner />
          <Text size="2">Loading session...</Text>
        </Flex>
      ) : error ? (
        <Card style={{ backgroundColor: "#fee2e2" }}>
          <Text size="2" color="red">
            {error}
          </Text>
        </Card>
      ) : !session ? (
        <Card>
          <Flex direction="column" gap="2">
            <Heading size="5">No active session</Heading>
            <Text size="2" color="gray">
              Pick a release to start listening.
            </Text>
            <Button asChild size="2">
              <Link to="/search">Browse Discogs</Link>
            </Button>
          </Flex>
        </Card>
      ) : (
        <>
          <Heading size="6">Now Playing</Heading>
          <Card className="now-playing-card">
            <Flex direction="column" gap="3">
              <Flex justify="between" align="center" gap="3">
                <Flex direction="column" gap="1">
                  <Text size="2" color="gray">
                    {session.release.artist}
                  </Text>
                  <Heading size="5">{session.release.title}</Heading>
                </Flex>
                <span className="status-pill">
                  <span className="status-dot" />
                  {session.state === "running" ? "Playing" : "Paused"}
                </span>
              </Flex>

              {currentTrack ? (
                <Text size="4" weight="bold">
                  {currentTrack.position}. {currentTrack.title}
                </Text>
              ) : (
                <Text size="2" color="gray">
                  No track information
                </Text>
              )}

              {durationMs ? (
                <Flex direction="column" gap="2">
                  <div className="progress-rail" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)}>
                    <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <Flex justify="between">
                    <Text size="1" color="gray">
                      {formatTime(elapsedMs)} elapsed
                    </Text>
                    <Text size="1" color="gray">
                      {formatTime(remainingMs)} left
                    </Text>
                  </Flex>
                  <Text size="1" color="gray">
                    {devMode ? "DEV MODE: Scrobbles logged only" : "Auto-advance on track end"}
                  </Text>
                </Flex>
              ) : (
                <Text size="1" color="gray">
                  Duration unknown, auto-advance unavailable.
                </Text>
              )}
            </Flex>
          </Card>

          <div className="session-actions">
            <Flex direction="column" gap="3">
              <Text size="2" color="gray">
                One-handed controls
              </Text>
              <div className="session-actions-buttons">
                {session.state === "paused" ? (
                  <Button size="4" onClick={() => void handleAction("resume")}>
                    Resume
                  </Button>
                ) : (
                  <Button size="4" variant="soft" onClick={() => void handleAction("pause")}>
                    Pause
                  </Button>
                )}
                <Button size="4" onClick={() => void handleAction("next")}>
                  Next Track
                </Button>
              </div>
            </Flex>
          </div>
        </>
      )}
    </Flex>
  );
}

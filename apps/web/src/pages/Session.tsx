import { useEffect, useMemo, useRef, useState } from "react";
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
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const localElapsedRef = useRef(0);
  const localStartRef = useRef<number | null>(null);
  const lastTrackKeyRef = useRef<string | null>(null);

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
  }, []);

  const currentTrack = useMemo(() => {
    if (!session) {
      return null;
    }
    return session.release.tracks[session.currentIndex] ?? null;
  }, [session]);

  const handleAction = async (action: "pause" | "resume" | "next") => {
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
  };

  useEffect(() => {
    if (!session) {
      return;
    }

    const trackKey = `${session.id}:${session.currentIndex}`;
    if (lastTrackKeyRef.current !== trackKey) {
      lastTrackKeyRef.current = trackKey;
      localElapsedRef.current = 0;
      localStartRef.current = session.state === "running" ? Date.now() : null;
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
  }, [session]);

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
          <Card>
            <Flex direction="column" gap="2">
              <Text size="2" color="gray">
                {session.release.artist}
              </Text>
              <Heading size="5">{session.release.title}</Heading>
              {currentTrack ? (
                <Text size="3">
                  {currentTrack.position}. {currentTrack.title}
                </Text>
              ) : (
                <Text size="2" color="gray">
                  No track information
                </Text>
              )}
              <Text size="2" color="gray">
                Status: {session.state}
              </Text>
            </Flex>
          </Card>

          <Flex gap="2" wrap="wrap">
            {session.state === "paused" ? (
              <Button size="3" onClick={() => void handleAction("resume")}>
                Resume
              </Button>
            ) : (
              <Button size="3" variant="soft" onClick={() => void handleAction("pause")}>
                Pause
              </Button>
            )}
            <Button size="3" onClick={() => void handleAction("next")}>
              Next Track
            </Button>
          </Flex>
        </>
      )}
    </Flex>
  );
}

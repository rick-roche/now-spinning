import { Hono } from "hono";
import type { Context } from "hono";
import {
  advanceSession,
  createAPIError,
  createSession,
  endSession,
  ErrorCode,
  isEligibleToScrobble,
  pauseSession,
  resumeSession,
  syncSession,
  SessionStartRequestSchema,
  SessionParamSchema,
  SessionScrobbleCurrentRequestSchema,
  SessionSyncRequestSchema,
  type SessionActionResponse,
  type SessionCurrentResponse,
  type SessionStartResponse,
  type SessionSyncResponse,
} from "@repo/shared";
import { getCookie } from "hono/cookie";
import { getOrCreateSessionId, loadStoredTokens, setSessionCookie, requireLastFm } from "../middleware/auth.js";
import {
  loadCurrentSession,
  loadSession,
  scrobbleTrack,
  sendNowPlaying,
  storeSession,
} from "../session-helpers.js";
import type { AppEnvironment } from "../types.js";
import { loadNormalizedDiscogsRelease } from "../utils/discogs-release.js";
import { formatZodErrors } from "../utils/validation.js";

type HonoContext = Context<{ Bindings: AppEnvironment }>;

const router = new Hono<{ Bindings: AppEnvironment }>();

router.post(
  "/start",
  requireLastFm,
  async (c: HonoContext) => {
    const storage = c.env.NOW_SPINNING_STORAGE;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"),
        400
      );
    }
    const bodyResult = SessionStartRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(bodyResult.error)),
        400
      );
    }

    const { releaseId, thresholdPercent, notifyOnSideCompletion } = bodyResult.data;

    const tokens = await loadStoredTokens(storage, userId);

    const releaseResponse = await loadNormalizedDiscogsRelease(c.env, storage, releaseId);
    if (!releaseResponse.ok) {
      if (releaseResponse.status === 429) {
        if (releaseResponse.retryAfter) c.header("Retry-After", releaseResponse.retryAfter);
        return c.json(createAPIError(ErrorCode.DISCOGS_RATE_LIMIT, "Discogs rate limit reached. Please retry shortly."), 429);
      }
      const code = releaseResponse.status === 500
        ? ErrorCode.CONFIG_ERROR
        : releaseResponse.status === 404
          ? ErrorCode.NOT_FOUND
          : ErrorCode.DISCOGS_ERROR;
      const message = releaseResponse.status === 500
        ? "Discogs credentials not configured"
        : releaseResponse.status === 404
          ? "Discogs release not found"
          : "Discogs release lookup failed";
      return c.json(createAPIError(code, message), releaseResponse.status);
    }
    if (releaseResponse.release.tracks.length === 0) {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "This release has no playable tracks"), 400);
    }

    const now = Date.now();
    const session = createSession({
      sessionId: crypto.randomUUID(),
      userId,
      release: releaseResponse.release,
      startedAt: now,
    });

    await storeSession(storage, session);
    const npResult = await sendNowPlaying(c.env, tokens.lastfm!.accessToken, session.release, session.currentIndex);
    if (!npResult.ok) {
      console.error("[POST /start] Failed to send now playing:", npResult.message);
    }

    await c.env.scheduler.startSession(session, thresholdPercent, notifyOnSideCompletion);

    const response: SessionStartResponse = { session };
    return c.json(response);
  }
);

router.post(
  "/:id/pause",
  requireLastFm,
  async (c: HonoContext) => {
    const storage = c.env.NOW_SPINNING_STORAGE;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate param
    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Path parameters validation failed", formatZodErrors(paramResult.error)),
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }

      const updated = pauseSession(session);
      await storeSession(storage, updated);
      await c.env.scheduler.pause(sessionId, true);

      const response: SessionActionResponse = { session: updated };
      return c.json(response);
    });
  }
);

router.post(
  "/:id/resume",
  requireLastFm,
  async (c: HonoContext) => {
    const storage = c.env.NOW_SPINNING_STORAGE;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate param
    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Path parameters validation failed", formatZodErrors(paramResult.error)),
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }

      const tokens = await loadStoredTokens(storage, userId);
      const now = Date.now();
      const updated = resumeSession(session, now);
      await storeSession(storage, updated);

      if (updated.state !== "ended") {
        const npResult = await sendNowPlaying(
          c.env,
          tokens.lastfm!.accessToken,
          updated.release,
          updated.currentIndex
        );
        if (!npResult.ok) {
          console.error("[POST /:id/resume] Failed to send now playing:", npResult.message);
        }

        await c.env.scheduler.resume(sessionId, now, true);
      }

      const response: SessionActionResponse = { session: updated };
      return c.json(response);
    });
  }
);

router.post(
  "/:id/scrobble-current",
  requireLastFm,
  async (c: HonoContext) => {
    const storage = c.env.NOW_SPINNING_STORAGE;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate param
    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Path parameters validation failed", formatZodErrors(paramResult.error)),
        400
      );
    }

    // Validate body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"),
        400
      );
    }
    const bodyResult = SessionScrobbleCurrentRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(bodyResult.error)),
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    const { elapsedMs, thresholdPercent } = bodyResult.data;

    return c.env.scheduler.runExclusive(sessionId, async () => {
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }

      const currentIndex = session.currentIndex;
      if (currentIndex < 0 || currentIndex >= session.tracks.length) {
        return c.json(createAPIError(ErrorCode.INVALID_TRACK_INDEX, "Current track index is invalid"), 500);
      }

      const currentTrack = session.tracks[currentIndex];
      if (!currentTrack) {
        return c.json(createAPIError(ErrorCode.INVALID_TRACK_INDEX, "Current track not found"), 500);
      }

      if (currentTrack.status === "scrobbled") {
        const response: SessionActionResponse = { session };
        return c.json(response);
      }

      const releaseTrack = session.release.tracks[currentIndex];
      const durationMs = releaseTrack?.durationSec ? releaseTrack.durationSec * 1000 : null;
      if (!isEligibleToScrobble(elapsedMs, durationMs, thresholdPercent)) {
        return c.json(
          createAPIError(ErrorCode.VALIDATION_ERROR, "Track has not been played long enough to scrobble"),
          400
        );
      }

      const tokens = await loadStoredTokens(storage, userId);
      const currentStartedAt = currentTrack.startedAt ?? Date.now();
      const scrobbleResult = await scrobbleTrack(
        c.env,
        tokens.lastfm!.accessToken,
        session.release,
        currentIndex,
        Math.floor(currentStartedAt / 1000)
      );
      if (!scrobbleResult.ok) {
        console.error("[POST /:id/scrobble-current] Failed to scrobble track:", scrobbleResult.message);
        return c.json(
          createAPIError(ErrorCode.LASTFM_ERROR, "Failed to scrobble track to Last.fm"),
          502
        );
      }

      const updatedTrack = { ...currentTrack, status: "scrobbled" as const, scrobbledAt: Date.now() };
      const updatedTracks = [...session.tracks];
      updatedTracks[currentIndex] = updatedTrack;
      const updated = { ...session, tracks: updatedTracks };
      await storeSession(storage, updated);

      const response: SessionActionResponse = { session: updated };
      return c.json(response);
    });
  }
);

router.post(
  "/:id/next",
  requireLastFm,
  async (c: HonoContext) => {
    const storage = c.env.NOW_SPINNING_STORAGE;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate param
    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Path parameters validation failed", formatZodErrors(paramResult.error)),
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }

      const tokens = await loadStoredTokens(storage, userId);
      const now = Date.now();
      const previousIndex = session.currentIndex;

      if (previousIndex < 0 || previousIndex >= session.tracks.length) {
        return c.json(createAPIError(ErrorCode.INVALID_TRACK_INDEX, "Current track index is invalid"), 500);
      }

      const previousTrack = session.tracks[previousIndex];
      const previousStartedAt = previousTrack?.startedAt ?? now;
      const wasAlreadyScrobbled = previousTrack?.status === "scrobbled";
      const updated = advanceSession(session, now);
      await storeSession(storage, updated);

      if (!wasAlreadyScrobbled) {
        const scrobbleResult = await scrobbleTrack(
          c.env,
          tokens.lastfm!.accessToken,
          updated.release,
          previousIndex,
          Math.floor(previousStartedAt / 1000)
        );
        if (!scrobbleResult.ok) {
          console.error("[POST /:id/next] Failed to scrobble track:", scrobbleResult.message);
        }
      }

      if (updated.state !== "ended") {
        const npResult = await sendNowPlaying(
          c.env,
          tokens.lastfm!.accessToken,
          updated.release,
          updated.currentIndex
        );
        if (!npResult.ok) {
          console.error("[POST /:id/next] Failed to send now playing:", npResult.message);
        }
      }

      await c.env.scheduler.next(sessionId, now, true);
      const response: SessionActionResponse = { session: updated };
      return c.json(response);
    });
  }
);

router.post(
  "/:id/end",
  requireLastFm,
  async (c: HonoContext) => {
    const storage = c.env.NOW_SPINNING_STORAGE;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Path parameters validation failed", formatZodErrors(paramResult.error)),
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }

      const tokens = await loadStoredTokens(storage, userId);
      const now = Date.now();
      const currentIndex = session.currentIndex;
      const currentTrack = session.tracks[currentIndex];
      const currentStartedAt = currentTrack?.startedAt ?? now;
      const wasAlreadyScrobbled = currentTrack?.status === "scrobbled";
      const updated = endSession(session);
      await storeSession(storage, updated);
      await c.env.scheduler.end(sessionId, true);

      if (session.state !== "ended" && !wasAlreadyScrobbled) {
        const scrobbleResult = await scrobbleTrack(
          c.env,
          tokens.lastfm!.accessToken,
          updated.release,
          currentIndex,
          Math.floor(currentStartedAt / 1000)
        );
        if (!scrobbleResult.ok) {
          console.error("[POST /:id/end] Failed to scrobble track:", scrobbleResult.message);
        }
      }

      const response: SessionActionResponse = { session: updated };
      return c.json(response);
    });
  }
);

router.post(
  "/:id/sync",
  requireLastFm,
  async (c: HonoContext) => {
    const storage = c.env.NOW_SPINNING_STORAGE;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        createAPIError(ErrorCode.VALIDATION_ERROR, "Path parameters validation failed", formatZodErrors(paramResult.error)),
        400
      );
    }

    const rawBody = await c.req.text();
    if (rawBody.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"), 400);
      }
      const bodyResult = SessionSyncRequestSchema.safeParse(body);
      if (!bodyResult.success) {
        return c.json(
          createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(bodyResult.error)),
          400
        );
      }
    }

    const { id: sessionId } = paramResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }

      const tokens = await loadStoredTokens(storage, userId);
      const now = Date.now();
      const schedule = storage.loadSchedule(sessionId);
      const { session: synced, scrobbleActions } = syncSession(
        session,
        now,
        schedule?.thresholdPercent ?? 50,
        schedule?.notifyOnSideCompletion ?? true
      );

      for (const action of scrobbleActions) {
        const scrobbleResult = await scrobbleTrack(
          c.env,
          tokens.lastfm!.accessToken,
          synced.release,
          action.trackIndex,
          Math.floor(action.startedAt / 1000)
        );
        if (!scrobbleResult.ok) {
          console.error(`[POST /:id/sync] Failed to scrobble track ${action.trackIndex}:`, scrobbleResult.message);
        }
      }

      if (synced.state === "running" && scrobbleActions.length > 0) {
        const npResult = await sendNowPlaying(
          c.env,
          tokens.lastfm!.accessToken,
          synced.release,
          synced.currentIndex
        );
        if (!npResult.ok) {
          console.error("[POST /:id/sync] Failed to send now playing:", npResult.message);
        }
      }

      await storeSession(storage, synced);
      if (synced.state === "running") await c.env.scheduler.resume(sessionId, now, true);

      const response: SessionSyncResponse = {
        session: synced,
        scrobbledCount: scrobbleActions.length,
      };
      return c.json(response);
    });
  }
);

router.get("/current", async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const userId = getCookie(c, "now_spinning_session");
  if (!userId) {
    const response: SessionCurrentResponse = { session: null };
    return c.json(response);
  }

  const session = await loadCurrentSession(storage, userId);
  const response: SessionCurrentResponse = { session };
  return c.json(response);
});

export const sessionRoutes = router;

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
  SessionMutationRequestSchema,
  SessionEndRequestSchema,
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
  deliverScrobble,
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
    let body: unknown;
    try { body = await c.req.json(); } catch {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"), 400);
    }
    const bodyResult = SessionMutationRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(bodyResult.error)), 400);
    }
    const { mutationId, expectedRevision, expectedTrackIndex } = bodyResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const replay = storage.loadSessionMutation<SessionActionResponse>(userId, sessionId, mutationId, "pause");
      if (replay) return c.json(replay);
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }
      if (session.revision !== expectedRevision || session.currentIndex !== expectedTrackIndex) {
        return c.json(createAPIError(ErrorCode.SESSION_MUTATION_CONFLICT, "Session changed; reload the current session", { session }), 409);
      }

      const updated = pauseSession(session, Date.now());
      const response: SessionActionResponse = { session: updated };
      storage.saveSessionMutation(updated, mutationId, "pause", response);
      await c.env.scheduler.pause(sessionId, true);
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
    let body: unknown;
    try { body = await c.req.json(); } catch {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"), 400);
    }
    const bodyResult = SessionMutationRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(bodyResult.error)), 400);
    }
    const { mutationId, expectedRevision, expectedTrackIndex } = bodyResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const replay = storage.loadSessionMutation<SessionActionResponse>(userId, sessionId, mutationId, "resume");
      if (replay) return c.json(replay);
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }
      if (session.revision !== expectedRevision || session.currentIndex !== expectedTrackIndex) {
        return c.json(createAPIError(ErrorCode.SESSION_MUTATION_CONFLICT, "Session changed; reload the current session", { session }), 409);
      }

      const tokens = await loadStoredTokens(storage, userId);
      const now = Date.now();
      const updated = resumeSession(session, now);
      const response: SessionActionResponse = { session: updated };
      storage.saveSessionMutation(updated, mutationId, "resume", response);

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
    const { mutationId, elapsedMs, thresholdPercent, expectedRevision, expectedTrackIndex } = bodyResult.data;

    return c.env.scheduler.runExclusive(sessionId, async () => {
      const replay = storage.loadSessionMutation<SessionActionResponse>(userId, sessionId, mutationId, "scrobble-current");
      if (replay) return c.json(replay);
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }
      if (session.revision !== expectedRevision || session.currentIndex !== expectedTrackIndex) {
        return c.json(createAPIError(ErrorCode.SESSION_MUTATION_CONFLICT, "Session changed; reload the current session", { session }), 409);
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
      const scrobbleResult = await deliverScrobble(storage, c.env, tokens.lastfm!.accessToken, userId, session.release, currentIndex, currentStartedAt);
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
      const updated = { ...session, tracks: updatedTracks, revision: session.revision + 1 };
      const response: SessionActionResponse = { session: updated };
      storage.saveSessionMutation(updated, mutationId, "scrobble-current", response);
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
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"), 400);
    }
    const bodyResult = SessionMutationRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(bodyResult.error)), 400);
    }
    const { mutationId, expectedRevision, expectedTrackIndex } = bodyResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const replay = storage.loadSessionMutation<SessionActionResponse>(userId, sessionId, mutationId, "next");
      if (replay) return c.json(replay);
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }
      if (session.revision !== expectedRevision || session.currentIndex !== expectedTrackIndex) {
        return c.json(createAPIError(ErrorCode.SESSION_MUTATION_CONFLICT, "Session changed; reload the current session", { session }), 409);
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
      const releaseTrack = session.release.tracks[previousIndex];
      const durationMs = releaseTrack?.durationSec ? releaseTrack.durationSec * 1000 : null;
      const schedule = storage.loadSchedule(sessionId);
      const eligible = previousStartedAt <= now && isEligibleToScrobble(
        now - previousStartedAt,
        durationMs,
        schedule?.thresholdPercent ?? 50,
      );
      if (!wasAlreadyScrobbled && eligible) {
        const scrobbleResult = await deliverScrobble(storage, c.env, tokens.lastfm!.accessToken, userId, session.release, previousIndex, previousStartedAt);
        if (!scrobbleResult.ok) {
          console.error("[POST /:id/next] Failed to scrobble track:", scrobbleResult.message);
          return c.json(createAPIError(ErrorCode.LASTFM_ERROR, "Failed to scrobble track to Last.fm"), 502);
        }
      }
      const updated = advanceSession(session, now, wasAlreadyScrobbled || eligible);
      const response: SessionActionResponse = { session: updated };
      await storeSession(storage, updated);
      storage.saveSessionMutation(updated, mutationId, "next", response);

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
    let body: unknown;
    try { body = await c.req.json(); } catch {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"), 400);
    }
    const bodyResult = SessionEndRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(bodyResult.error)), 400);
    }
    const { mutationId, expectedRevision, expectedTrackIndex, endMode } = bodyResult.data;
    return c.env.scheduler.runExclusive(sessionId, async () => {
      const replay = storage.loadSessionMutation<SessionActionResponse>(userId, sessionId, mutationId, "end");
      if (replay) return c.json(replay);
      const session = await loadSession(storage, sessionId);
      if (!session || session.userId !== userId) {
        return c.json(createAPIError(ErrorCode.SESSION_NOT_FOUND, "Session not found"), 404);
      }
      if (session.revision !== expectedRevision || session.currentIndex !== expectedTrackIndex) {
        return c.json(createAPIError(ErrorCode.SESSION_MUTATION_CONFLICT, "Session changed; reload the current session", { session }), 409);
      }

      const now = Date.now();
      const currentIndex = session.currentIndex;
      const tracks = [...session.tracks];
      if (session.state !== "ended" && endMode === "skip-remaining") {
        for (let index = currentIndex; index < tracks.length; index += 1) {
          const track = tracks[index];
          if (track?.status === "pending") tracks[index] = { ...track, status: "skipped", scrobbledAt: null };
        }
      } else if (session.state !== "ended" && endMode === "scrobble-current-and-remaining") {
        const tokens = await loadStoredTokens(storage, userId);
        for (let index = currentIndex; index < tracks.length; index += 1) {
          const track = tracks[index];
          if (!track || track.status !== "pending") continue;
          const scrobbleResult = await deliverScrobble(storage, c.env, tokens.lastfm!.accessToken, userId, session.release, index, track.startedAt ?? now);
          if (!scrobbleResult.ok) {
            console.error(`[POST /:id/end] Failed to scrobble track ${index}:`, scrobbleResult.message);
            await storeSession(storage, { ...session, tracks, revision: session.revision + 1 });
            return c.json(createAPIError(ErrorCode.LASTFM_ERROR, "Failed to scrobble track to Last.fm"), 502);
          }
          tracks[index] = { ...track, status: "scrobbled", scrobbledAt: now };
        }
      }
      const updated = endSession({ ...session, tracks });
      const response: SessionActionResponse = { session: updated };
      await storeSession(storage, updated);
      storage.saveSessionMutation(updated, mutationId, "end", response);
      await c.env.scheduler.end(sessionId, true);
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

      let deliveredCount = 0;
      let persisted = synced;
      for (const [actionIndex, action] of scrobbleActions.entries()) {
        const scrobbleResult = await deliverScrobble(
          storage, c.env, tokens.lastfm!.accessToken, userId, synced.release, action.trackIndex, action.startedAt
        );
        if (!scrobbleResult.ok) {
          console.error(`[POST /:id/sync] Failed to scrobble track ${action.trackIndex}:`, scrobbleResult.message);
          const confirmed = new Set(scrobbleActions.slice(0, actionIndex).map((item) => item.trackIndex));
          const tracks = persisted.tracks.map((track, index) => {
            if (index >= action.trackIndex) return { ...track, status: "pending" as const, scrobbledAt: null };
            return confirmed.has(index) ? { ...track, status: "scrobbled" as const, scrobbledAt: now } : track;
          });
          persisted = { ...session, currentIndex: action.trackIndex, state: "running", tracks, revision: session.revision + 1 };
          break;
        }
        deliveredCount += 1;
      }

      if (persisted.state === "running" && deliveredCount > 0) {
        const npResult = await sendNowPlaying(
          c.env,
          tokens.lastfm!.accessToken,
          persisted.release,
          persisted.currentIndex
        );
        if (!npResult.ok) {
          console.error("[POST /:id/sync] Failed to send now playing:", npResult.message);
        }
      }

      await storeSession(storage, persisted);
      if (persisted.state === "running") await c.env.scheduler.resume(sessionId, now, true);

      const response: SessionSyncResponse = {
        session: persisted,
        scrobbledCount: deliveredCount,
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

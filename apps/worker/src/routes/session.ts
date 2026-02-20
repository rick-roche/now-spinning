/**
 * Session endpoints (M3 MVP).
 */

import { Hono } from "hono";
import type { Context } from "hono";
import {
  advanceSession,
  createSession,
  endSession,
  normalizeDiscogsRelease,
  pauseSession,
  resumeSession,
  SessionStartRequestSchema,
  SessionParamSchema,
  type DiscogsReleaseApiResponse,
  type NormalizedRelease,
  type Session,
  type SessionActionResponse,
  type SessionCurrentResponse,
  type SessionStartResponse,
} from "@repo/shared";
import { fetchLastFm } from "../lastfm.js";
import { getOrCreateSessionId, loadStoredTokens, setSessionCookie, requireLastFm } from "../middleware/auth.js";
import type { CloudflareBinding } from "../types.js";
import { DISCOGS_API_BASE, DISCOGS_USER_AGENT, getDiscogsAppCredentials } from "../utils/discogs.js";
import { formatZodErrors } from "../utils/validation.js";

type HonoContext = Context<{ Bindings: CloudflareBinding }>;

const router = new Hono<{ Bindings: CloudflareBinding }>();

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function currentSessionKey(userId: string): string {
  return `session:current:${userId}`;
}

async function storeSession(kv: KVNamespace, session: Session): Promise<void> {
  await kv.put(sessionKey(session.id), JSON.stringify(session));
  await kv.put(currentSessionKey(session.userId), session.id);
}

async function loadSession(kv: KVNamespace, sessionId: string): Promise<Session | null> {
  return (await kv.get<Session>(sessionKey(sessionId), "json")) ?? null;
}

async function loadCurrentSession(
  kv: KVNamespace,
  userId: string
): Promise<Session | null> {
  const currentId = await kv.get<string>(currentSessionKey(userId));
  if (!currentId) {
    return null;
  }

  return loadSession(kv, currentId);
}

async function fetchDiscogsRelease(
  c: HonoContext,
  releaseId: string
): Promise<
  | { ok: true; release: NormalizedRelease }
  | { ok: false; status: 400 | 502 | 500; message: string }
> {
  const appCredentials = getDiscogsAppCredentials(c);
  if (!appCredentials) {
    return { ok: false, status: 500, message: "Discogs credentials not configured" };
  }

  const releaseUrl = new URL(`${DISCOGS_API_BASE}/releases/${releaseId}`);

  const response = await fetch(releaseUrl.toString(), {
    headers: {
      "User-Agent": DISCOGS_USER_AGENT,
      "Authorization": `Discogs key=${appCredentials.consumerKey}, secret=${appCredentials.consumerSecret}`,
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status >= 500 ? 502 : 400,
      message: "Discogs release lookup failed",
    };
  }

  const raw: unknown = await response.json();
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      status: 502,
      message: "Discogs release lookup returned invalid data",
    };
  }

  return {
    ok: true,
    release: normalizeDiscogsRelease(raw as DiscogsReleaseApiResponse),
  };
}

function buildLastFmParams(values: Record<string, string | number | null | undefined>):
  Record<string, string> {
  const params: Record<string, string> = {};
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    params[key] = String(value);
  });
  return params;
}

async function sendNowPlaying(
  env: CloudflareBinding,
  sessionKeyValue: string,
  release: NormalizedRelease,
  trackIndex: number
): Promise<{ ok: boolean; message?: string }> {
  if (trackIndex < 0 || trackIndex >= release.tracks.length) {
    return { ok: false, message: "Track index out of bounds" };
  }
  
  const track = release.tracks[trackIndex];
  if (!track) {
    return { ok: false, message: "Track not found" };
  }

  const isDevMode = env.DEV_MODE === "true";
  
  if (isDevMode) {
    console.log("[DEV MODE] Would send Now Playing:", {
      artist: track.artist,
      track: track.title,
      album: release.title,
      duration: track.durationSec,
    });
    return { ok: true };
  }

  const result = await fetchLastFm("track.updateNowPlaying", {
    ...buildLastFmParams({
      sk: sessionKeyValue,
      artist: track.artist,
      track: track.title,
      album: release.title,
      duration: track.durationSec,
    }),
  }, env);

  if (!result.ok) {
    console.error("[sendNowPlaying] Last.fm API error:", result.message);
  }
  return result;
}

async function scrobbleTrack(
  env: CloudflareBinding,
  sessionKeyValue: string,
  release: NormalizedRelease,
  trackIndex: number,
  timestampSec: number
): Promise<{ ok: boolean; message?: string }> {
  if (trackIndex < 0 || trackIndex >= release.tracks.length) {
    return { ok: false, message: "Track index out of bounds" };
  }
  
  const track = release.tracks[trackIndex];
  if (!track) {
    return { ok: false, message: "Track not found" };
  }

  const isDevMode = env.DEV_MODE === "true";
  
  if (isDevMode) {
    console.log("[DEV MODE] Would scrobble:", {
      artist: track.artist,
      track: track.title,
      album: release.title,
      timestamp: new Date(timestampSec * 1000).toISOString(),
      duration: track.durationSec,
    });
    return { ok: true };
  }

  const result = await fetchLastFm("track.scrobble", {
    ...buildLastFmParams({
      sk: sessionKeyValue,
      artist: track.artist,
      track: track.title,
      album: release.title,
      timestamp: timestampSec,
      duration: track.durationSec,
    }),
  }, env);

  if (!result.ok) {
    console.error("[scrobbleTrack] Last.fm API error:", result.message);
  }
  return result;
}

router.post(
  "/start",
  requireLastFm,
  async (c: HonoContext) => {
    const kv = c.env.NOW_SPINNING_KV;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate body
    const body: unknown = await c.req.json();
    const bodyResult = SessionStartRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request body validation failed",
            details: formatZodErrors(bodyResult.error),
          },
        },
        400
      );
    }

    const { releaseId } = bodyResult.data;

    if (!/^[0-9]+$/.test(releaseId)) {
      return c.json(
        { error: { code: "INVALID_RELEASE_ID", message: "Release id must be numeric" } },
        400
      );
    }

    const tokens = await loadStoredTokens(kv, userId);
    if (!tokens.lastfm) {
      return c.json(
        { error: { code: "LASTFM_NOT_CONNECTED", message: "Last.fm is not connected" } },
        401
      );
    }

    const releaseResponse = await fetchDiscogsRelease(c, releaseId);
    if (!releaseResponse.ok) {
      const status = releaseResponse.status;
      return c.json(
        { error: { code: "DISCOGS_ERROR", message: releaseResponse.message } },
        status
      );
    }

    const now = Date.now();
    const session = createSession({
      sessionId: crypto.randomUUID(),
      userId,
      release: releaseResponse.release,
      startedAt: now,
    });

    await storeSession(kv, session);
    const npResult = await sendNowPlaying(c.env, tokens.lastfm.accessToken, session.release, session.currentIndex);
    if (!npResult.ok) {
      console.error("[POST /start] Failed to send now playing:", npResult.message);
    }

    const response: SessionStartResponse = { session };
    return c.json(response);
  }
);

router.post(
  "/:id/pause",
  requireLastFm,
  async (c: HonoContext) => {
    const kv = c.env.NOW_SPINNING_KV;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate param
    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Path parameters validation failed",
            details: formatZodErrors(paramResult.error),
          },
        },
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    const session = await loadSession(kv, sessionId);
    if (!session || session.userId !== userId) {
      return c.json(
        { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } },
        404
      );
    }

    const updated = pauseSession(session);
    await storeSession(kv, updated);

    const response: SessionActionResponse = { session: updated };
    return c.json(response);
  }
);

router.post(
  "/:id/resume",
  requireLastFm,
  async (c: HonoContext) => {
    const kv = c.env.NOW_SPINNING_KV;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate param
    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Path parameters validation failed",
            details: formatZodErrors(paramResult.error),
          },
        },
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    const session = await loadSession(kv, sessionId);
    if (!session || session.userId !== userId) {
      return c.json(
        { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } },
        404
      );
    }

    const updated = resumeSession(session, Date.now());
    await storeSession(kv, updated);

    const response: SessionActionResponse = { session: updated };
    return c.json(response);
  }
);

router.post(
  "/:id/next",
  requireLastFm,
  async (c: HonoContext) => {
    const kv = c.env.NOW_SPINNING_KV;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    // Validate param
    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Path parameters validation failed",
            details: formatZodErrors(paramResult.error),
          },
        },
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    const session = await loadSession(kv, sessionId);
    if (!session || session.userId !== userId) {
      return c.json(
        { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } },
        404
      );
    }

    const tokens = await loadStoredTokens(kv, userId);
    if (!tokens.lastfm) {
      return c.json(
        { error: { code: "LASTFM_NOT_CONNECTED", message: "Last.fm is not connected" } },
        401
      );
    }

    const now = Date.now();
    const previousIndex = session.currentIndex;
    
    if (previousIndex < 0 || previousIndex >= session.tracks.length) {
      return c.json(
        { error: { code: "INVALID_TRACK_INDEX", message: "Current track index is invalid" } },
        500
      );
    }
    
    const previousStartedAt = session.tracks[previousIndex]?.startedAt ?? now;
    const updated = advanceSession(session, now);

    await storeSession(kv, updated);

    const scrobbleResult = await scrobbleTrack(
      c.env,
      tokens.lastfm.accessToken,
      updated.release,
      previousIndex,
      Math.floor(previousStartedAt / 1000)
    );
    if (!scrobbleResult.ok) {
      console.error("[POST /:id/next] Failed to scrobble track:", scrobbleResult.message);
    }

    if (updated.state !== "ended") {
      const npResult = await sendNowPlaying(
        c.env,
        tokens.lastfm.accessToken,
        updated.release,
        updated.currentIndex
      );
      if (!npResult.ok) {
        console.error("[POST /:id/next] Failed to send now playing:", npResult.message);
      }
    }

    const response: SessionActionResponse = { session: updated };
    return c.json(response);
  }
);

router.post(
  "/:id/end",
  requireLastFm,
  async (c: HonoContext) => {
    const kv = c.env.NOW_SPINNING_KV;
    const userId = getOrCreateSessionId(c);
    setSessionCookie(c, userId);

    const params = c.req.param();
    const paramResult = SessionParamSchema.safeParse(params);
    if (!paramResult.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Path parameters validation failed",
            details: formatZodErrors(paramResult.error),
          },
        },
        400
      );
    }

    const { id: sessionId } = paramResult.data;
    const session = await loadSession(kv, sessionId);
    if (!session || session.userId !== userId) {
      return c.json(
        { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } },
        404
      );
    }

    const tokens = await loadStoredTokens(kv, userId);

    const now = Date.now();
    const currentIndex = session.currentIndex;
    const currentStartedAt = session.tracks[currentIndex]?.startedAt ?? now;

    const updated = endSession(session);
    await storeSession(kv, updated);

    if (tokens.lastfm && session.state !== "ended") {
      const scrobbleResult = await scrobbleTrack(
        c.env,
        tokens.lastfm.accessToken,
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
  }
);

router.get("/current", async (c: HonoContext) => {
  const kv = c.env.NOW_SPINNING_KV;
  const userId = getOrCreateSessionId(c);
  setSessionCookie(c, userId);

  const session = await loadCurrentSession(kv, userId);
  const response: SessionCurrentResponse = { session };
  return c.json(response);
});

export const sessionRoutes = router;

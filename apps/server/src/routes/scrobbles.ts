import { Hono } from "hono";
import type { Context } from "hono";
import {
  createAPIError,
  createDirectScrobbleTimestamps,
  DirectScrobbleRequestSchema,
  ErrorCode,
  RecentScrobblesQuerySchema,
  type RecentScrobblesResponse,
  type DirectScrobbleOperation,
  type DirectScrobbleResponse,
  type DirectScrobbleTrackResult,
} from "@repo/shared";
import { getOrCreateSessionId, loadStoredTokens, requireLastFm, setSessionCookie, storeTokens } from "../middleware/auth.js";
import { loadNormalizedDiscogsRelease } from "../utils/discogs-release.js";
import { formatZodErrors } from "../utils/validation.js";
import { fetchLastFmRecentTracks, resolveLastFmUsername, scrobbleDirectBatch } from "../lastfm.js";
import type { AppEnvironment } from "../types.js";

type HonoContext = Context<{ Bindings: AppEnvironment }>;
const router = new Hono<{ Bindings: AppEnvironment }>();
const directOperationLocks = new Map<string, Promise<void>>();

export async function serializeDirectOperation<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = directOperationLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  directOperationLocks.set(key, current);
  await previous;
  try { return await action(); }
  finally {
    release();
    if (directOperationLocks.get(key) === current) directOperationLocks.delete(key);
  }
}

router.get("/recent", requireLastFm, async (c: HonoContext) => {
  const parsed = RecentScrobblesQuerySchema.safeParse({ page: c.req.query("page"), limit: c.req.query("limit") });
  if (!parsed.success) return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Recent scrobbles query validation failed", formatZodErrors(parsed.error)), 400);

  const userId = getOrCreateSessionId(c);
  const storage = c.env.NOW_SPINNING_STORAGE;
  const tokens = await loadStoredTokens(storage, userId);
  const lastfm = tokens.lastfm;
  if (!lastfm) return c.json(createAPIError(ErrorCode.LASTFM_NOT_CONNECTED, "Last.fm connection required"), 401);

  let username = lastfm.username;
  if (!username) {
    const resolved = await resolveLastFmUsername(c.env, lastfm.accessToken);
    if (!resolved.ok) return c.json(createAPIError(ErrorCode.RECENT_SCROBBLES_ERROR, "Unable to resolve Last.fm username"), 502);
    username = resolved.username;
    tokens.lastfm = { ...lastfm, username };
    await storeTokens(storage, userId, tokens);
  }

  const result = await fetchLastFmRecentTracks(c.env, lastfm.accessToken, username, parsed.data.page, parsed.data.limit);
  if (!result.ok) return c.json(createAPIError(ErrorCode.RECENT_SCROBBLES_ERROR, "Unable to load recent scrobbles"), 502);
  const response: RecentScrobblesResponse = result;
  return c.json(response);
});

function responseFor(operation: DirectScrobbleOperation, release: { id: string; title: string; artist: string }): DirectScrobbleResponse {
  return { operation, release };
}

router.post("/", requireLastFm, async (c: HonoContext) => {
  const storage = c.env.NOW_SPINNING_STORAGE;
  const userId = getOrCreateSessionId(c);
  setSessionCookie(c, userId);
  let body: unknown;
  try { body = await c.req.json(); } catch {
    return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Invalid or malformed JSON body"), 400);
  }
  const parsed = DirectScrobbleRequestSchema.safeParse(body);
  if (!parsed.success) return c.json(createAPIError(ErrorCode.VALIDATION_ERROR, "Request body validation failed", formatZodErrors(parsed.error)), 400);
  const request = parsed.data;
  const fingerprint = JSON.stringify({ releaseId: request.releaseId, trackIndices: request.trackIndices });

  return serializeDirectOperation(request.operationId, async () => {
  const owner = storage.loadDirectScrobbleOperationOwner(request.operationId);
  if (owner && owner !== userId) {
    return c.json(createAPIError(ErrorCode.SCROBBLE_OPERATION_CONFLICT, "Operation ID was already used for a different user"), 409);
  }
  const existing = storage.loadDirectScrobbleOperation(userId, request.operationId);
  if (existing && existing.fingerprint !== fingerprint) {
    return c.json(createAPIError(ErrorCode.SCROBBLE_OPERATION_CONFLICT, "Operation ID was already used for a different request"), 409);
  }

  const releaseResponse = await loadNormalizedDiscogsRelease(c.env, storage, request.releaseId);
  if (!releaseResponse.ok) {
    const code = releaseResponse.status === 404 ? ErrorCode.NOT_FOUND : releaseResponse.status === 500 ? ErrorCode.CONFIG_ERROR : ErrorCode.DISCOGS_ERROR;
    const message = releaseResponse.status === 404 ? "Discogs release not found" : releaseResponse.status === 500 ? "Discogs credentials not configured" : "Discogs release lookup failed";
    return c.json(createAPIError(code, message), releaseResponse.status);
  }
  const release = releaseResponse.release;
  if (request.trackIndices.some((index) => !release.tracks[index])) {
    return c.json(createAPIError(ErrorCode.INVALID_TRACK_INDEX, "Selected track index is invalid"), 400);
  }

  if (existing?.tombstone) {
    const now = Date.now();
    const operation: DirectScrobbleOperation = { operationId: request.operationId, releaseId: request.releaseId, trackIndices: request.trackIndices, createdAt: now, updatedAt: now, status: "completed", activeSessionWarning: false, tracks: [] };
    return c.json(responseFor(operation, release));
  }

  const now = Math.floor(Date.now() / 1000);
  let operation = existing?.operation;
  if (!operation) {
    const timestamps = createDirectScrobbleTimestamps(request.trackIndices.length, now);
    const currentSession = storage.loadCurrentSession(userId);
    operation = {
      operationId: request.operationId, releaseId: request.releaseId, trackIndices: request.trackIndices,
      createdAt: Date.now(), updatedAt: Date.now(), status: "pending",
      activeSessionWarning: Boolean(currentSession && currentSession.state !== "ended"),
      tracks: request.trackIndices.map((trackIndex, index) => ({ trackIndex, title: release.tracks[trackIndex]!.title, timestamp: timestamps[index]!, status: "unconfirmed" as const, retryable: true })),
    };
    storage.saveDirectScrobbleOperation(userId, operation, Date.now(), fingerprint);
  }

  const tokens = await loadStoredTokens(storage, userId);
  const pending = operation.tracks.filter((track) => track.retryable === true);
  if (pending.length > 0) {
    const transportResults = await scrobbleDirectBatch(c.env, tokens.lastfm!.accessToken, pending.map((track) => {
      const releaseTrack = release.tracks[track.trackIndex]!;
      return { artist: releaseTrack.artist, track: releaseTrack.title, album: release.title, timestamp: track.timestamp, duration: releaseTrack.durationSec };
    }));
    const byIndex = new Map<number, DirectScrobbleTrackResult>();
    pending.forEach((track, index) => {
      const result = transportResults[index];
      if (!result) return;
      byIndex.set(track.trackIndex, {
        ...track,
        status: result.status,
        ...("message" in result && result.message ? { message: result.message } : {}),
        retryable: result.status === "failed" ? result.transient : result.status === "unconfirmed",
      });
    });
    operation = { ...operation, tracks: operation.tracks.map((track) => byIndex.get(track.trackIndex) ?? track), updatedAt: Date.now() };
  }
  const hasRetryable = operation.tracks.some((track) => track.retryable === true);
  operation = { ...operation, status: hasRetryable ? "pending" : operation.tracks.some((track) => track.status === "failed") ? "failed" : "completed", updatedAt: Date.now() };
  storage.saveDirectScrobbleOperation(userId, operation, Date.now(), fingerprint);
  return c.json(responseFor(operation, release));
  });
});

export const scrobbleRoutes = router;

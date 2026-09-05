import { afterEach, describe, expect, it, vi } from "vitest";
import { unlinkSync } from "node:fs";
import { createSession, type NormalizedRelease } from "@repo/shared";
import { createApp } from "../app.js";
import { openDatabase } from "../storage/database.js";
import { SQLiteStorage } from "../storage/storage.js";
import { SessionScheduler } from "../scheduler/session-scheduler.js";
import type { AppEnvironment } from "../types.js";

const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) { try { unlinkSync(path); } catch { /* test cleanup */ } } vi.restoreAllMocks(); });

const release: NormalizedRelease = {
  id: "release-1",
  title: "Test Release",
  artist: "Test Artist",
  year: 2024,
  coverUrl: null,
  tracks: [{ index: 0, position: "A1", title: "First", artist: "Test Artist", durationSec: 180, side: "A" }],
};

describe("session routes", () => {
  it("serializes pause and resume with scheduler state", async () => {
    const path = `/tmp/now-spinning-route-${crypto.randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session-1", userId: "user-1", release, startedAt: Date.now() });
    storage.saveSession(session);
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "dev-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: Date.now() + 60_000, updatedAt: Date.now() });

    const environment = {
      port: 3000,
      databasePath: path,
      publicAppOrigin: "http://localhost:3000",
      lastfmCallbackUrl: "http://localhost:3000/api/auth/lastfm/callback",
      discogsCallbackUrl: "http://localhost:3000/api/auth/discogs/callback",
      allowedOrigins: [],
      devMode: true,
      staticRoot: "/nonexistent",
      NOW_SPINNING_STORAGE: storage,
      scheduler: undefined,
    } as unknown as AppEnvironment;
    const scheduler = new SessionScheduler(storage, environment);
    environment.scheduler = scheduler;
    const app = createApp(environment);
    await scheduler.start();

    const headers = { Cookie: "now_spinning_session=user-1" };
    const pausedResponse = await app.fetch(new Request("http://localhost/api/session/session-1/pause", { method: "POST", headers }), environment);
    expect(pausedResponse.status).toBe(200);
    expect(storage.loadSession(session.id)?.state).toBe("paused");
    expect(storage.loadSchedule(session.id)?.dueAt).toBeNull();

    const resumedResponse = await app.fetch(new Request("http://localhost/api/session/session-1/resume", { method: "POST", headers }), environment);
    expect(resumedResponse.status).toBe(200);
    expect(storage.loadSession(session.id)?.state).toBe("running");
    expect(storage.loadSchedule(session.id)?.dueAt).not.toBeNull();

    await scheduler.stop();
    storage.close();
  });

  it("keeps the failed sync action retryable after confirming earlier actions", async () => {
    const path = `/tmp/now-spinning-route-${crypto.randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const twoTrackRelease: NormalizedRelease = {
      ...release,
      tracks: [
        { ...release.tracks[0]!, durationSec: 60 },
        { index: 1, position: "A2", title: "Second", artist: "Test Artist", durationSec: 60, side: "A" },
      ],
    };
    const session = createSession({ sessionId: "session-1", userId: "user-1", release: twoTrackRelease, startedAt: Date.now() - 180_000 });
    storage.saveSession(session);
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "session-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: null, updatedAt: Date.now() });
    const environment = {
      port: 3000, databasePath: path, publicAppOrigin: "http://localhost:3000",
      lastfmCallbackUrl: "http://localhost:3000/api/auth/lastfm/callback", discogsCallbackUrl: "http://localhost:3000/api/auth/discogs/callback",
      allowedOrigins: [], devMode: false, lastfmApiKey: "key", lastfmApiSecret: "secret", staticRoot: "/nonexistent",
      NOW_SPINNING_STORAGE: storage, scheduler: undefined,
    } as unknown as AppEnvironment;
    const scheduler = new SessionScheduler(storage, environment);
    environment.scheduler = scheduler;
    const app = createApp(environment);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ scrobbles: { scrobble: [{ corrected: 0 }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 1, message: "temporary" }), { status: 200 }));

    const response = await app.fetch(new Request("http://localhost/api/session/session-1/sync", {
      method: "POST", headers: { Cookie: "now_spinning_session=user-1" }, body: "{}",
    }), environment);

    expect(response.status).toBe(200);
    expect((await response.json() as { scrobbledCount: number }).scrobbledCount).toBe(1);
    const persisted = storage.loadSession(session.id)!;
    expect(persisted.currentIndex).toBe(1);
    expect(persisted.tracks[0]?.status).toBe("scrobbled");
    expect(persisted.tracks[1]).toMatchObject({ status: "pending", startedAt: expect.any(Number) });
    storage.close();
  });

  it("keeps a failed next scrobble retryable without advancing the session", async () => {
    const path = `/tmp/now-spinning-route-${crypto.randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const twoTrackRelease: NormalizedRelease = {
      ...release,
      tracks: [
        release.tracks[0]!,
        { index: 1, position: "A2", title: "Second", artist: "Test Artist", durationSec: 180, side: "A" },
      ],
    };
    const session = createSession({ sessionId: "session-1", userId: "user-1", release: twoTrackRelease, startedAt: Date.now() });
    storage.saveSession(session);
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "session-key", storedAt: 1 }, discogs: null });
    const environment = {
      port: 3000, databasePath: path, publicAppOrigin: "http://localhost:3000",
      lastfmCallbackUrl: "http://localhost:3000/api/auth/lastfm/callback", discogsCallbackUrl: "http://localhost:3000/api/auth/discogs/callback",
      allowedOrigins: [], devMode: false, lastfmApiKey: "key", lastfmApiSecret: "secret", staticRoot: "/nonexistent",
      NOW_SPINNING_STORAGE: storage, scheduler: undefined,
    } as unknown as AppEnvironment;
    const scheduler = new SessionScheduler(storage, environment);
    environment.scheduler = scheduler;
    const app = createApp(environment);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 1, message: "temporary" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ scrobbles: { scrobble: [{ corrected: 0 }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ nowplaying: { track: { corrected: 0 } } }), { status: 200 }));
    const request = () => app.fetch(new Request("http://localhost/api/session/session-1/next", {
      method: "POST", headers: { Cookie: "now_spinning_session=user-1" },
    }), environment);

    expect((await request()).status).toBe(502);
    expect(storage.loadSession(session.id)?.currentIndex).toBe(0);
    expect(storage.loadSession(session.id)?.tracks[0]?.status).toBe("pending");

    expect((await request()).status).toBe(200);
    expect(storage.loadSession(session.id)?.currentIndex).toBe(1);
    expect(storage.loadSession(session.id)?.tracks[0]?.status).toBe("scrobbled");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    storage.close();
  });

  it("records a confirmed current-track scrobble before ending the session", async () => {
    const path = `/tmp/now-spinning-route-${crypto.randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session-1", userId: "user-1", release, startedAt: Date.now() });
    storage.saveSession(session);
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "session-key", storedAt: 1 }, discogs: null });
    const environment = {
      port: 3000, databasePath: path, publicAppOrigin: "http://localhost:3000",
      lastfmCallbackUrl: "http://localhost:3000/api/auth/lastfm/callback", discogsCallbackUrl: "http://localhost:3000/api/auth/discogs/callback",
      allowedOrigins: [], devMode: false, lastfmApiKey: "key", lastfmApiSecret: "secret", staticRoot: "/nonexistent",
      NOW_SPINNING_STORAGE: storage, scheduler: undefined,
    } as unknown as AppEnvironment;
    const scheduler = new SessionScheduler(storage, environment);
    environment.scheduler = scheduler;
    const app = createApp(environment);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ scrobbles: { scrobble: [{ corrected: 0 }] } }), { status: 200 }));

    const response = await app.fetch(new Request("http://localhost/api/session/session-1/end", {
      method: "POST", headers: { Cookie: "now_spinning_session=user-1" },
    }), environment);

    expect(response.status).toBe(200);
    expect(storage.loadSession(session.id)?.tracks[0]?.status).toBe("scrobbled");
    storage.close();
  });
});

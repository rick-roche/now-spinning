import { afterEach, describe, expect, it, vi } from "vitest";
import { unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createSession, pauseSession, type NormalizedRelease } from "@repo/shared";
import { openDatabase } from "../storage/database.js";
import { SQLiteStorage } from "../storage/storage.js";
import type { AppEnvironment } from "../types.js";
import { SessionScheduler } from "./session-scheduler.js";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) {
    try { unlinkSync(path); } catch { /* test cleanup */ }
  }
});

const release: NormalizedRelease = {
  id: "release-1",
  title: "Test Release",
  artist: "Test Artist",
  year: 2024,
  coverUrl: null,
  tracks: [{ index: 0, position: "A1", title: "First", artist: "Test Artist", durationSec: 180, side: "A" }],
};

const multiSideRelease: NormalizedRelease = {
  ...release,
  tracks: [
    ...release.tracks,
    { index: 1, position: "B1", title: "Second", artist: "Test Artist", durationSec: 180, side: "B" },
  ],
};

describe("SessionScheduler", () => {
  it("starts background work only for the scheduler holding the SQLite lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session-1", userId: "user-1", release, startedAt: Date.now() - 240_000 });
    storage.startSession(session, 50, false);
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "dev-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: Date.now() - 1, updatedAt: Date.now() });

    const environment = { devMode: true } as AppEnvironment;
    const first = new SessionScheduler(storage, environment);
    const second = new SessionScheduler(storage, environment);
    await first.start();
    await second.start();
    await vi.advanceTimersByTimeAsync(1_100);

    const updated = storage.loadSession(session.id);
    expect(updated?.state).toBe("ended");
    expect(storage.acquireSchedulerLease("third")).toBe(false);

    await second.stop();
    await first.stop();
    storage.close();
    vi.useRealTimers();
  });

  it("retries startup ownership after an existing lease expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session-retry", userId: "user-retry", release, startedAt: -120_000 });
    storage.startSession(session, 50, false);
    storage.storeTokens("user-retry", { lastfm: { service: "lastfm", accessToken: "dev-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: 0, updatedAt: 0 });
    expect(storage.acquireSchedulerLease("blocker", 0, 60_000)).toBe(true);

    const scheduler = new SessionScheduler(storage, { devMode: true } as AppEnvironment);
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(storage.loadSession(session.id)?.state).toBe("ended");
    await scheduler.stop();
    storage.close();
    vi.useRealTimers();
  });

  it("preserves paused schedules across restart", async () => {
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const running = createSession({ sessionId: "session-paused", userId: "user-paused", release, startedAt: Date.now() - 120_000 });
    const paused = pauseSession(running);
    storage.saveSession(paused);
    storage.saveSchedule({ sessionId: paused.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: Date.now() - 1, updatedAt: Date.now() });

    const scheduler = new SessionScheduler(storage, { devMode: true } as AppEnvironment);
    await scheduler.start();
    expect(storage.loadSchedule(paused.id)?.dueAt).toBeNull();
    await scheduler.stop();
    storage.close();
  });

  it("timestamps automatic pauses at a side boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(600_000);
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const created = createSession({ sessionId: "session-side-pause", userId: "user-side-pause", release: multiSideRelease, startedAt: 0 });
    const firstTrack = created.tracks[0];
    if (!firstTrack) throw new Error("Expected a session track");
    const session = {
      ...created,
      tracks: [{ ...firstTrack, status: "scrobbled" as const, scrobbledAt: 90_000 }, ...created.tracks.slice(1)],
    };
    storage.startSession(session, 50, true);
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: true, dueAt: 599_999, updatedAt: 599_999 });

    const scheduler = new SessionScheduler(storage, { devMode: true } as AppEnvironment);
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(1);

    const paused = storage.loadSession(session.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pausedAt).toBe(600_000);

    await scheduler.stop();
    storage.close();
    vi.useRealTimers();
  });

  it("supersedes the previous user's session when starting a new one", async () => {
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const first = createSession({ sessionId: "session-first", userId: "same-user", release, startedAt: Date.now() });
    const second = createSession({ sessionId: "session-second", userId: "same-user", release, startedAt: Date.now() });
    storage.saveSession(first);
    storage.saveSchedule({ sessionId: first.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: Date.now() + 60_000, updatedAt: Date.now() });
    storage.saveSession(second);

    const scheduler = new SessionScheduler(storage, { devMode: true } as AppEnvironment);
    await scheduler.start();
    await scheduler.startSession(second, 50, false);

    expect(storage.loadSession(first.id)?.state).toBe("ended");
    expect(storage.loadSchedule(first.id)).toBeNull();
    expect(storage.loadCurrentSession("same-user")?.id).toBe(second.id);
    expect(storage.loadSchedule(second.id)).not.toBeNull();

    storage.saveSession(first);
    expect(storage.loadCurrentSession("same-user")?.id).toBe(second.id);

    await scheduler.stop();
    storage.close();
  });

  it("does not scrobble a session superseded while its scheduled work is starting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const first = createSession({ sessionId: "session-race-first", userId: "same-user", release, startedAt: -240_000 });
    const second = createSession({ sessionId: "session-race-second", userId: "same-user", release, startedAt: 0 });
    storage.saveSession(first);
    storage.storeTokens("same-user", { lastfm: { service: "lastfm", accessToken: "dev-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: first.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: -1, updatedAt: 0 });
    const scheduler = new SessionScheduler(storage, { devMode: false, lastfmApiKey: "api-key", lastfmApiSecret: "api-secret" } as AppEnvironment);
    const loadTokens = storage.loadTokens.bind(storage);
    vi.spyOn(storage, "loadTokens").mockImplementation((userId) => {
      void scheduler.startSession(second, 50, false);
      return loadTokens(userId);
    });
    const fetch = vi.spyOn(globalThis, "fetch");

    await scheduler.start();
    await vi.advanceTimersByTimeAsync(1_100);

    expect(fetch).not.toHaveBeenCalled();
    expect(storage.loadSession(first.id)?.state).toBe("ended");
    expect(storage.loadCurrentSession("same-user")?.id).toBe(second.id);
    expect(storage.loadSchedule(first.id)).toBeNull();
    expect(storage.loadSchedule(second.id)).not.toBeNull();

    await scheduler.stop();
    storage.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("advances an already-scrobbled track when Last.fm credentials disappear", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const created = createSession({ sessionId: "session-no-lastfm", userId: "user-no-lastfm", release, startedAt: Date.now() - 240_000 });
    const firstTrack = created.tracks[0];
    if (!firstTrack) throw new Error("Expected a session track");
    const session = {
      ...created,
      tracks: [{ ...firstTrack, status: "scrobbled" as const, scrobbledAt: Date.now() - 60_000 }],
    };
    storage.startSession(session, 50, false);
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: Date.now() - 1, updatedAt: Date.now() });

    const scheduler = new SessionScheduler(storage, { devMode: true } as AppEnvironment);
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(1_100);

    expect(storage.loadSession(session.id)?.state).toBe("ended");
    expect(storage.loadSchedule(session.id)).toBeNull();
    await scheduler.stop();
    storage.close();
    vi.useRealTimers();
  });

  it("retains a pending track when a Last.fm request rejects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session-fetch-failure", userId: "user-fetch-failure", release, startedAt: -240_000 });
    storage.startSession(session, 50, false);
    storage.storeTokens("user-fetch-failure", { lastfm: { service: "lastfm", accessToken: "dev-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: -1, updatedAt: 0 });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const scheduler = new SessionScheduler(storage, {
      devMode: false,
      lastfmApiKey: "api-key",
      lastfmApiSecret: "api-secret",
    } as AppEnvironment);
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(1_100);

    expect(storage.loadSession(session.id)?.tracks[0]?.status).toBe("pending");
    expect(storage.loadSchedule(session.id)?.dueAt).toBe(30_000);
    await scheduler.stop();
    storage.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("bounds shutdown while provider work is stalled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session-stalled-fetch", userId: "user-stalled-fetch", release, startedAt: -240_000 });
    storage.startSession(session, 50, false);
    storage.storeTokens("user-stalled-fetch", { lastfm: { service: "lastfm", accessToken: "dev-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: -1, updatedAt: 0 });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => undefined));

    const scheduler = new SessionScheduler(storage, {
      devMode: false,
      lastfmApiKey: "api-key",
      lastfmApiSecret: "api-secret",
    } as AppEnvironment);
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(1_100);

    const stopped = scheduler.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    await stopped;
    storage.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
});

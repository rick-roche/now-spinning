import { afterEach, describe, expect, it } from "vitest";
import { unlinkSync } from "node:fs";
import { createSession, type NormalizedRelease } from "@repo/shared";
import { createApp } from "../app.js";
import { openDatabase } from "../storage/database.js";
import { SQLiteStorage } from "../storage/storage.js";
import { SessionScheduler } from "../scheduler/session-scheduler.js";
import type { AppEnvironment } from "../types.js";

const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) { try { unlinkSync(path); } catch { /* test cleanup */ } } });

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
});

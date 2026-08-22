import { afterEach, describe, expect, it } from "vitest";
import { unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createSession, type NormalizedRelease } from "@repo/shared";
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

describe("SessionScheduler", () => {
  it("starts background work only for the scheduler holding the SQLite lease", async () => {
    const path = `/tmp/now-spinning-scheduler-${randomUUID()}.sqlite`;
    paths.push(path);
    const storage = new SQLiteStorage(openDatabase(path));
    const session = createSession({ sessionId: "session-1", userId: "user-1", release, startedAt: Date.now() - 120_000 });
    storage.saveSession(session);
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "dev-key", storedAt: 1 }, discogs: null });
    storage.saveSchedule({ sessionId: session.id, thresholdPercent: 50, notifyOnSideCompletion: false, dueAt: Date.now() - 1, updatedAt: Date.now() });

    const environment = { devMode: true } as AppEnvironment;
    const first = new SessionScheduler(storage, environment);
    const second = new SessionScheduler(storage, environment);
    await first.start();
    await second.start();
    await new Promise((resolve) => setTimeout(resolve, 25));

    const updated = storage.loadSession(session.id);
    expect(updated?.state).toBe("ended");
    expect(storage.acquireSchedulerLease("third")).toBe(false);

    await second.stop();
    await first.stop();
    storage.close();
  });
});

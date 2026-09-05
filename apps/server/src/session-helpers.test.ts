import { afterEach, describe, expect, it, vi } from "vitest";
import { unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { createSession, type NormalizedRelease } from "@repo/shared";
import { openDatabase } from "./storage/database.js";
import { SQLiteStorage } from "./storage/storage.js";
import { deliverScrobble } from "./session-helpers.js";

const release: NormalizedRelease = {
  id: "release-1", title: "Album", artist: "Artist", year: 2024, coverUrl: null,
  tracks: [{ index: 0, position: "A1", title: "Track", artist: "Artist", durationSec: 180, side: "A" }],
};

describe("deliverScrobble", () => {
  let storage: SQLiteStorage | undefined;
  let path: string | undefined;
  afterEach(() => {
    storage?.close(); storage = undefined;
    if (path) { try { unlinkSync(path); } catch { /* test cleanup */ } path = undefined; }
    vi.restoreAllMocks();
  });

  it("leaves a failed delivery retryable and records a successful retry once", async () => {
    path = `/tmp/now-spinning-helper-${crypto.randomUUID()}.sqlite`;
    storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session", userId: "user", release, startedAt: 1_000 });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 1, message: "temporary" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ scrobbles: { scrobble: [{ corrected: 0 }] } }), { status: 200 }));
    const env = { lastfmApiKey: "key", lastfmApiSecret: "secret", devMode: false } as never;

    const first = await deliverScrobble(storage, env, "session-key", session.userId, release, 0, 1_000);
    expect(first.ok).toBe(false);
    const second = await deliverScrobble(storage, env, "session-key", session.userId, release, 0, 1_000);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const replay = await deliverScrobble(storage, env, "session-key", session.userId, release, 0, 1_000);
    expect(replay.ok).toBe(true);
    expect(replay.claimed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not report an interrupted in-flight delivery as confirmed", async () => {
    path = `/tmp/now-spinning-helper-${crypto.randomUUID()}.sqlite`;
    const initialStorage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const session = createSession({ sessionId: "session", userId: "user", release, startedAt: 1_000 });
    // Simulate a process stop after the durable claim but before Last.fm responds.
    const id = createHash("sha256").update(JSON.stringify({
      userId: session.userId, releaseId: release.id, trackTitle: "Track", artist: "Artist", startedAt: 1,
    })).digest("hex");
    expect(initialStorage.claimScrobble(id, session.userId)).toBe("claimed");
    initialStorage.close();
    storage = new SQLiteStorage(openDatabase(path), Buffer.alloc(32, 7));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const replay = await deliverScrobble(storage, { devMode: true } as never, "session-key", session.userId, release, 0, 1_000);

    expect(replay.ok).toBe(false);
    expect(replay.message).toBe("Scrobble delivery is awaiting confirmation");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

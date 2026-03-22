import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSession, type Session, type NormalizedRelease } from "@repo/shared";
import { SessionAlarmDO } from "./session-do";
import type { CloudflareBinding } from "./types";
import { createKVMock } from "./test-utils";

function createTestRelease(): NormalizedRelease {
  return {
    id: "12345",
    title: "Test Album",
    artist: "Test Artist",
    year: 2024,
    coverUrl: null,
    tracks: [
      { position: "A1", title: "Track One", artist: "Test Artist", durationSec: 180, side: "A", index: 0 },
      { position: "A2", title: "Track Two", artist: "Test Artist", durationSec: 240, side: "A", index: 1 },
      { position: "B1", title: "Track Three", artist: "Test Artist", durationSec: 200, side: "B", index: 2 },
    ],
  };
}

function createTestSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  return createSession({
    sessionId: "test-session-id",
    userId: "test-user-id",
    release: createTestRelease(),
    startedAt: now,
    ...overrides,
  });
}

function createDOStorageMock() {
  const store = new Map<string, unknown>();
  let scheduledAlarm: number | null = null;

  return {
    get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
      return store.get(key) as T | undefined;
    }),
    put: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    setAlarm: vi.fn(async (time: number) => {
      scheduledAlarm = time;
    }),
    getAlarm: vi.fn(async () => scheduledAlarm),
    deleteAlarm: vi.fn(async () => {
      scheduledAlarm = null;
    }),
    store,
    getScheduledAlarm: () => scheduledAlarm,
  };
}

function createMockState(storageMock: ReturnType<typeof createDOStorageMock>) {
  return {
    id: { toString: () => "mock-do-id" },
    storage: storageMock,
    waitUntil: vi.fn(),
  } as unknown as DurableObjectState;
}

function createMockEnv(kvMock: ReturnType<typeof createKVMock>): CloudflareBinding {
  return {
    NOW_SPINNING_KV: kvMock as unknown as KVNamespace,
    SESSION_DO: {} as unknown as DurableObjectNamespace,
    DEV_MODE: "true",
    LASTFM_API_KEY: "test-key",
    LASTFM_API_SECRET: "test-secret",
  } as CloudflareBinding;
}

function makeRequest(path: string, body: Record<string, unknown> = {}): Request {
  return new Request(`https://internal/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SessionAlarmDO", () => {
  let kvMock: ReturnType<typeof createKVMock>;
  let storageMock: ReturnType<typeof createDOStorageMock>;
  let state: DurableObjectState;
  let env: CloudflareBinding;
  let durable: SessionAlarmDO;

  beforeEach(() => {
    kvMock = createKVMock();
    storageMock = createDOStorageMock();
    state = createMockState(storageMock);
    env = createMockEnv(kvMock);
    durable = new SessionAlarmDO(state, env);
  });

  describe("fetch - start command", () => {
    it("should store metadata and schedule alarm for first track", async () => {
      const session = createTestSession();
      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));

      const response = await durable.fetch(
        makeRequest("start", {
          command: "start",
          sessionId: session.id,
          userId: session.userId,
          lastfmSessionKey: "test-lastfm-key",
          thresholdPercent: 50,
        })
      );

      expect(response.status).toBe(200);
      expect(storageMock.put).toHaveBeenCalledWith("sessionId", session.id);
      expect(storageMock.put).toHaveBeenCalledWith("userId", session.userId);
      expect(storageMock.put).toHaveBeenCalledWith("lastfmSessionKey", "test-lastfm-key");
      expect(storageMock.put).toHaveBeenCalledWith("thresholdPercent", 50);
      expect(storageMock.setAlarm).toHaveBeenCalledTimes(1);
    });

    it("should return 404 if session not found in KV", async () => {
      const response = await durable.fetch(
        makeRequest("start", {
          command: "start",
          sessionId: "nonexistent",
          userId: "user",
          lastfmSessionKey: "key",
          thresholdPercent: 50,
        })
      );

      expect(response.status).toBe(404);
    });
  });

  describe("fetch - pause command", () => {
    it("should cancel the scheduled alarm", async () => {
      await durable.fetch(makeRequest("pause", { command: "pause" }));

      expect(storageMock.deleteAlarm).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetch - resume command", () => {
    it("should reschedule alarm for current track", async () => {
      const session = createTestSession();
      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      storageMock.store.set("sessionId", session.id);

      const response = await durable.fetch(
        makeRequest("resume", {
          command: "resume",
          resumedAt: Date.now(),
        })
      );

      expect(response.status).toBe(200);
      expect(storageMock.setAlarm).toHaveBeenCalledTimes(1);
    });

    it("should schedule alarm for track with unknown duration using 30s fallback", async () => {
      const release = createTestRelease();
      release.tracks[0] = { ...release.tracks[0]!, durationSec: 0 };
      const session = createSession({
        sessionId: "no-duration-session",
        userId: "test-user-id",
        release,
        startedAt: Date.now(),
      });
      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      storageMock.store.set("sessionId", session.id);

      const response = await durable.fetch(
        makeRequest("resume", {
          command: "resume",
          resumedAt: Date.now(),
        })
      );

      expect(response.status).toBe(200);
      expect(storageMock.setAlarm).toHaveBeenCalledTimes(1);
    });

    it("should return 400 if no session stored", async () => {
      const response = await durable.fetch(
        makeRequest("resume", {
          command: "resume",
          resumedAt: Date.now(),
        })
      );

      expect(response.status).toBe(400);
    });
  });

  describe("fetch - next command", () => {
    it("should cancel existing alarm and reschedule after track advance", async () => {
      const session = createTestSession();
      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      storageMock.store.set("sessionId", session.id);

      const response = await durable.fetch(
        makeRequest("next", {
          command: "next",
          advancedAt: Date.now(),
        })
      );

      expect(response.status).toBe(200);
      expect(storageMock.deleteAlarm).toHaveBeenCalledTimes(1);
      expect(storageMock.setAlarm).toHaveBeenCalled();
    });
  });

  describe("fetch - end command", () => {
    it("should cancel alarm and clear stored metadata", async () => {
      storageMock.store.set("sessionId", "test-session");
      storageMock.store.set("userId", "test-user");
      storageMock.store.set("lastfmSessionKey", "test-key");
      storageMock.store.set("thresholdPercent", 50);

      const response = await durable.fetch(makeRequest("end", { command: "end" }));

      expect(response.status).toBe(200);
      expect(storageMock.deleteAlarm).toHaveBeenCalledTimes(1);
      expect(storageMock.delete).toHaveBeenCalledWith("sessionId");
      expect(storageMock.delete).toHaveBeenCalledWith("userId");
      expect(storageMock.delete).toHaveBeenCalledWith("lastfmSessionKey");
      expect(storageMock.delete).toHaveBeenCalledWith("thresholdPercent");
    });
  });

  describe("fetch - unknown command", () => {
    it("should return 400 for unknown path", async () => {
      const response = await durable.fetch(
        makeRequest("unknown", { command: "unknown" })
      );

      expect(response.status).toBe(400);
    });

    it("should return 405 for non-POST", async () => {
      const response = await durable.fetch(
        new Request("https://internal/start", { method: "GET" })
      );

      expect(response.status).toBe(405);
    });
  });

  describe("alarm", () => {
    it("should scrobble current track, advance session, send now playing, and schedule next alarm", async () => {
      const now = Date.now();
      const session = createTestSession({ startedAt: now - 200_000 } as Partial<Session>);
      session.tracks[0] = { ...session.tracks[0]!, startedAt: now - 200_000 };

      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      kvMock.store.set(`session:current:${session.userId}`, session.id);
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "test-lastfm-key");

      await durable.alarm();

      const updatedRaw = kvMock.store.get(`session:${session.id}`);
      expect(updatedRaw).toBeDefined();
      const updated = JSON.parse(updatedRaw!) as Session;

      expect(updated.tracks[0]!.status).toBe("scrobbled");
      expect(updated.currentIndex).toBe(1);
      expect(updated.tracks[1]!.startedAt).not.toBeNull();
      expect(storageMock.setAlarm).toHaveBeenCalled();
    });

    it("should not act if session not found", async () => {
      storageMock.store.set("sessionId", "nonexistent");
      storageMock.store.set("lastfmSessionKey", "key");

      await durable.alarm();

      expect(storageMock.setAlarm).not.toHaveBeenCalled();
    });

    it("should not act if session is paused", async () => {
      const session = createTestSession();
      session.state = "paused";
      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "key");

      await durable.alarm();

      expect(storageMock.setAlarm).not.toHaveBeenCalled();
    });

    it("should end session after last track", async () => {
      const now = Date.now();
      const release = createTestRelease();
      release.tracks = [release.tracks[0]!];

      const session = createSession({
        sessionId: "single-track-session",
        userId: "test-user-id",
        release,
        startedAt: now - 200_000,
      });
      session.tracks[0] = { ...session.tracks[0]!, startedAt: now - 200_000 };

      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      kvMock.store.set(`session:current:${session.userId}`, session.id);
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "key");

      await durable.alarm();

      const updatedRaw = kvMock.store.get(`session:${session.id}`);
      const updated = JSON.parse(updatedRaw!) as Session;
      expect(updated.state).toBe("ended");
      expect(updated.tracks[0]!.status).toBe("scrobbled");
    });

    it("should skip if track already scrobbled", async () => {
      const session = createTestSession();
      session.tracks[0] = { ...session.tracks[0]!, status: "scrobbled", scrobbledAt: Date.now() };
      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "key");

      await durable.alarm();

      expect(storageMock.setAlarm).not.toHaveBeenCalled();
    });

    it("should not act if no session metadata stored", async () => {
      await durable.alarm();

      expect(storageMock.setAlarm).not.toHaveBeenCalled();
    });

    it("should reschedule instead of scrobbling when track has not reached threshold", async () => {
      const now = Date.now();
      const session = createTestSession({ startedAt: now - 200_000 } as Partial<Session>);
      session.currentIndex = 1;
      session.tracks[0] = { ...session.tracks[0]!, status: "scrobbled", scrobbledAt: now - 2_000 };
      session.tracks[1] = { ...session.tracks[1]!, startedAt: now - 2_000 };

      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      kvMock.store.set(`session:current:${session.userId}`, session.id);
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "test-lastfm-key");

      await durable.alarm();

      const updatedRaw = kvMock.store.get(`session:${session.id}`);
      const updated = JSON.parse(updatedRaw!) as Session;
      expect(updated.currentIndex).toBe(1);
      expect(updated.tracks[1]!.status).toBe("pending");
      expect(storageMock.setAlarm).toHaveBeenCalledTimes(1);
    });

    it("should schedule alarm using 30s fallback for tracks with unknown duration", async () => {
      const now = Date.now();
      const release = createTestRelease();
      release.tracks[0] = { ...release.tracks[0]!, durationSec: 0 };

      const session = createSession({
        sessionId: "unknown-duration-session",
        userId: "test-user-id",
        release,
        startedAt: now,
      });
      session.tracks[0] = { ...session.tracks[0]!, startedAt: now };

      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      kvMock.store.set(`session:current:${session.userId}`, session.id);
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "key");

      await durable.alarm();

      expect(storageMock.setAlarm).toHaveBeenCalledTimes(1);
      expect(kvMock.store.get(`session:${session.id}`)).toBeDefined();
      const updated = JSON.parse(kvMock.store.get(`session:${session.id}`)!) as Session;
      expect(updated.tracks[0]!.status).toBe("pending");
    });

    it("should scrobble track with unknown duration after 30s elapsed", async () => {
      const now = Date.now();
      const release = createTestRelease();
      release.tracks[0] = { ...release.tracks[0]!, durationSec: 0 };

      const session = createSession({
        sessionId: "unknown-duration-elapsed-session",
        userId: "test-user-id",
        release,
        startedAt: now - 60_000,
      });
      session.tracks[0] = { ...session.tracks[0]!, startedAt: now - 60_000 };

      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      kvMock.store.set(`session:current:${session.userId}`, session.id);
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "key");

      await durable.alarm();

      const updated = JSON.parse(kvMock.store.get(`session:${session.id}`)!) as Session;
      expect(updated.tracks[0]!.status).toBe("scrobbled");
      expect(updated.currentIndex).toBe(1);
    });

    it("should use stored thresholdPercent when scheduling and checking eligibility", async () => {
      const now = Date.now();
      const session = createTestSession({ startedAt: now - 200_000 } as Partial<Session>);
      session.tracks[0] = { ...session.tracks[0]!, startedAt: now - 200_000 };

      kvMock.store.set(`session:${session.id}`, JSON.stringify(session));
      kvMock.store.set(`session:current:${session.userId}`, session.id);
      storageMock.store.set("sessionId", session.id);
      storageMock.store.set("lastfmSessionKey", "test-lastfm-key");
      storageMock.store.set("thresholdPercent", 75);

      await durable.alarm();

      const updated = JSON.parse(kvMock.store.get(`session:${session.id}`)!) as Session;
      expect(updated.tracks[0]!.status).toBe("scrobbled");
    });
  });
});

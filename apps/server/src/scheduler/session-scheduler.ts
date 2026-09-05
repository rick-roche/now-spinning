import { advanceSession, getPhysicalMediaBoundary, getScrobbleThresholdMs, isScrobblableDuration, pauseSession, type Session } from "@repo/shared";
import { randomUUID } from "node:crypto";
import { deliverScrobble, sendNowPlaying, storeSession } from "../session-helpers.js";
import type { AppEnvironment } from "../types.js";
import type { SQLiteStorage } from "../storage/storage.js";

type Timer = ReturnType<typeof setTimeout>;

export class SessionScheduler {
  private static readonly leaseDurationMs = 60_000;
  private static readonly leaseRenewalMs = 15_000;
  private static readonly shutdownDrainMs = 5_000;
  private readonly timers = new Map<string, Timer>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly ownerId = randomUUID();
  private leaseTimer: Timer | undefined;
  private ownsLease = false;
  private stopped = false;

  constructor(private readonly storage: SQLiteStorage, private readonly env: AppEnvironment) {}

  start(): Promise<void> {
    this.maintainLease();
    this.leaseTimer = setInterval(() => this.maintainLease(), SessionScheduler.leaseRenewalMs);
    return Promise.resolve();
  }

  private bootstrapSchedules(): void {
    for (const schedule of this.storage.loadSchedules()) {
      const session = this.storage.loadSession(schedule.sessionId);
      if (!session || session.state === "ended") {
        this.storage.deleteSchedule(schedule.sessionId);
        continue;
      }
      if (session.state === "paused") {
        if (schedule.dueAt !== null) this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: Date.now() });
        continue;
      }
      if (schedule.dueAt === null) {
        continue;
      }
      if (schedule.dueAt <= Date.now()) void this.process(schedule.sessionId, schedule.dueAt).catch((error: unknown) => {
        console.error("[SessionScheduler] Background work failed:", error instanceof Error ? error.message : "unknown error");
      });
      else this.arm(schedule.sessionId, schedule.dueAt);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = undefined;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await new Promise<void>((resolve) => {
      const drainTimer = setTimeout(resolve, SessionScheduler.shutdownDrainMs);
      void Promise.allSettled(this.locks.values()).then(() => {
        clearTimeout(drainTimer);
        resolve();
      });
    });
    if (this.ownsLease) this.storage.releaseSchedulerLease(this.ownerId);
    this.ownsLease = false;
  }

  async startSession(session: Session, thresholdPercent: number, notifyOnSideCompletion: boolean): Promise<void> {
    this.storage.startSession(session, thresholdPercent, notifyOnSideCompletion);
    await this.schedule(session.id, Date.now());
  }

  async pause(sessionId: string, locked = false): Promise<void> {
    const action = (): Promise<void> => {
      this.clear(sessionId);
      const schedule = this.storage.loadSchedule(sessionId);
      if (schedule) this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: Date.now() });
      return Promise.resolve();
    };
    if (locked) await action(); else await this.withLock(sessionId, action);
  }

  async resume(sessionId: string, at: number, locked = false): Promise<void> {
    const action = async (): Promise<void> => { await this.schedule(sessionId, at); };
    if (locked) await action(); else await this.withLock(sessionId, action);
  }

  async next(sessionId: string, at: number, locked = false): Promise<void> {
    const action = async (): Promise<void> => { this.clear(sessionId); await this.schedule(sessionId, at); };
    if (locked) await action(); else await this.withLock(sessionId, action);
  }

  async end(sessionId: string, locked = false): Promise<void> {
    const action = (): Promise<void> => { this.clear(sessionId); this.storage.deleteSchedule(sessionId); return Promise.resolve(); };
    if (locked) await action(); else await this.withLock(sessionId, action);
  }

  async runExclusive<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
    let result!: T;
    await this.withLock(sessionId, async () => { result = await action(); });
    return result;
  }

  private async withLock(sessionId: string, action: () => Promise<void>): Promise<void> {
    const previous = this.locks.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    this.locks.set(sessionId, current);
    try { await current; } finally { if (this.locks.get(sessionId) === current) this.locks.delete(sessionId); }
  }

  private clear(sessionId: string): void { const timer = this.timers.get(sessionId); if (timer) clearTimeout(timer); this.timers.delete(sessionId); }

  private maintainLease(): void {
    if (this.stopped) return;
    if (this.ownsLease) {
      if (this.storage.renewSchedulerLease(this.ownerId, Date.now(), SessionScheduler.leaseDurationMs)) return;
      this.ownsLease = false;
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
      return;
    }
    if (this.storage.acquireSchedulerLease(this.ownerId, Date.now(), SessionScheduler.leaseDurationMs)) {
      this.ownsLease = true;
      this.bootstrapSchedules();
    }
  }

  private arm(sessionId: string, dueAt: number): void {
    if (this.stopped || !this.ownsLease) return;
    this.clear(sessionId);
    const timer = setTimeout(() => void this.process(sessionId, dueAt).catch((error: unknown) => {
      console.error("[SessionScheduler] Background work failed:", error instanceof Error ? error.message : "unknown error");
    }), Math.max(1, dueAt - Date.now()));
    this.timers.set(sessionId, timer);
  }

  private schedule(sessionId: string, referenceTime: number): Promise<void> {
    const session = this.storage.loadSession(sessionId);
    const schedule = this.storage.loadSchedule(sessionId);
    if (!session || !schedule || session.state !== "running") return Promise.resolve();
    const track = session.release.tracks[session.currentIndex];
    const state = session.tracks[session.currentIndex];
    if (!track || !state || state.startedAt === null) return Promise.resolve();
    const durationMs = track.durationSec && track.durationSec > 0 ? track.durationSec * 1000 : null;
    if (!isScrobblableDuration(durationMs)) {
      this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: Date.now() });
      return Promise.resolve();
    }
    const scrobbleDueAt = state.startedAt + (getScrobbleThresholdMs(durationMs, schedule.thresholdPercent) ?? 30_000);
    const dueAt = state.status === "pending" ? scrobbleDueAt : durationMs === null ? null : state.startedAt + durationMs;
    if (dueAt === null) {
      this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: Date.now() });
      return Promise.resolve();
    }
    this.storage.saveSchedule({ ...schedule, dueAt: Math.max(referenceTime + 1000, dueAt), updatedAt: Date.now() });
    this.arm(sessionId, Math.max(referenceTime + 1000, dueAt));
    return Promise.resolve();
  }

  private async process(sessionId: string, expectedDueAt: number): Promise<void> {
    await this.withLock(sessionId, async () => {
      if (this.stopped || !this.ownsLease || !this.storage.ownsSchedulerLease(this.ownerId)) return;
      const schedule = this.storage.loadSchedule(sessionId);
      if (!schedule || schedule.dueAt !== expectedDueAt) return;
      const session = this.storage.loadSession(sessionId);
      if (!session || session.state === "ended") { this.clear(sessionId); this.storage.deleteSchedule(sessionId); return; }
      if (session.state !== "running") {
        this.clear(sessionId);
        this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: Date.now() });
        return;
      }
      const current = session.tracks[session.currentIndex];
      const track = session.release.tracks[session.currentIndex];
      if (!current || !track || current.startedAt === null) { this.clear(sessionId); return; }
      const now = Date.now();
      const durationMs = track.durationSec && track.durationSec > 0 ? track.durationSec * 1000 : null;
      if (!isScrobblableDuration(durationMs)) {
        this.clear(sessionId);
        this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: now });
        return;
      }
      const startedAt = current.startedAt;
      const thresholdMs = getScrobbleThresholdMs(durationMs, schedule.thresholdPercent) ?? 30_000;
      if (current.status === "pending") {
        if (now - startedAt < thresholdMs) { await this.schedule(sessionId, now); return; }
        const tokens = this.storage.loadTokens(session.userId);
        if (!tokens.lastfm) { this.storage.saveSchedule({ ...schedule, dueAt: now + 30_000, updatedAt: now }); this.arm(sessionId, now + 30_000); return; }
        if (!this.storage.isCurrentSession(session.userId, session.id)) return;
        const result = await deliverScrobble(this.storage, this.env, tokens.lastfm.accessToken, session.userId, session.release, session.currentIndex, startedAt);
        if (this.stopped) return;
        if (!result.ok) { console.error(`[SessionScheduler] Failed to scrobble track ${session.currentIndex}:`, result.message); this.storage.saveSchedule({ ...schedule, dueAt: now + 30_000, updatedAt: now }); this.arm(sessionId, now + 30_000); return; }
        const tracks = [...session.tracks];
        tracks[session.currentIndex] = { ...current, status: "scrobbled", scrobbledAt: now };
        await storeSession(this.storage, { ...session, tracks, revision: session.revision + 1 });
        await this.schedule(sessionId, now);
        return;
      }
      if (durationMs === null || now - startedAt < durationMs) { await this.schedule(sessionId, now); return; }
      const trackEnd = startedAt + durationMs;
      const nextTrack = session.release.tracks[session.currentIndex + 1];
      if (schedule.notifyOnSideCompletion && nextTrack && getPhysicalMediaBoundary(session.release, track, nextTrack)) {
        const tracks = [...session.tracks];
        tracks[session.currentIndex] = { ...current, status: "scrobbled", scrobbledAt: current.scrobbledAt ?? now };
        const paused = pauseSession({ ...session, tracks }, now);
        await storeSession(this.storage, paused); this.clear(sessionId); this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: now }); return;
      }
      const tokens = this.storage.loadTokens(session.userId);
      if (!tokens.lastfm) {
        if (current.status !== "scrobbled") {
          this.clear(sessionId);
          this.storage.saveSchedule({ ...schedule, dueAt: null, updatedAt: now });
          return;
        }
        const advancedWithoutLastFm = advanceSession(session, trackEnd);
        await storeSession(this.storage, advancedWithoutLastFm);
        if (advancedWithoutLastFm.state === "ended") {
          this.clear(sessionId);
          this.storage.deleteSchedule(sessionId);
        } else {
          await this.schedule(sessionId, now);
        }
        return;
      }
      const advanced = advanceSession(session, trackEnd);
      const tracks = [...advanced.tracks];
      const completed = tracks[session.currentIndex];
      if (completed?.status === "scrobbled") tracks[session.currentIndex] = { ...completed, scrobbledAt: now };
      const updated = { ...advanced, tracks };
      await storeSession(this.storage, updated);
      if (updated.state === "ended") { this.clear(sessionId); this.storage.deleteSchedule(sessionId); return; }
      const np = await sendNowPlaying(this.env, tokens.lastfm.accessToken, updated.release, updated.currentIndex);
      if (this.stopped) return;
      if (!np.ok) console.error(`[SessionScheduler] Failed to send now playing:`, np.message);
      await this.schedule(sessionId, now);
    });
  }
}

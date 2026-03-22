import { advanceSession, type Session } from "@repo/shared";
import {
  loadSession,
  scrobbleTrack,
  sendNowPlaying,
  storeSession,
} from "./session-helpers.js";
import type { CloudflareBinding } from "./types.js";

interface StartCommand {
  command: "start";
  sessionId: string;
  userId: string;
  lastfmSessionKey: string;
}

interface PauseCommand {
  command: "pause";
}

interface ResumeCommand {
  command: "resume";
  resumedAt: number;
}

interface NextCommand {
  command: "next";
  advancedAt: number;
}

interface EndCommand {
  command: "end";
}

type DOCommand = StartCommand | PauseCommand | ResumeCommand | NextCommand | EndCommand;

const SCROBBLE_THRESHOLD_PERCENT = 50;

export class SessionAlarmDO implements DurableObject {
  private ctx: DurableObjectState;
  private env: CloudflareBinding;

  constructor(ctx: DurableObjectState, env: CloudflareBinding) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, "");

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body: unknown = await request.json();
    const cmd = body as DOCommand;

    switch (path) {
      case "start":
        return this.handleStart(cmd as StartCommand);
      case "pause":
        return this.handlePause();
      case "resume":
        return this.handleResume(cmd as ResumeCommand);
      case "next":
        return this.handleNext(cmd as NextCommand);
      case "end":
        return this.handleEnd();
      default:
        return new Response("Unknown command", { status: 400 });
    }
  }

  async alarm(): Promise<void> {
    const sessionId = await this.ctx.storage.get<string>("sessionId");
    const lastfmSessionKey = await this.ctx.storage.get<string>("lastfmSessionKey");

    if (!sessionId || !lastfmSessionKey) {
      return;
    }

    const session = await loadSession(this.env.NOW_SPINNING_KV, sessionId);
    if (!session || session.state !== "running") {
      return;
    }

    const currentIndex = session.currentIndex;
    const currentTrack = session.tracks[currentIndex];
    const releaseTrack = session.release.tracks[currentIndex];

    if (!currentTrack || !releaseTrack || currentTrack.status === "scrobbled") {
      return;
    }

    // Guard: verify the track has actually played long enough to scrobble.
    // A stale alarm (e.g. from before a manual "next"/side-flip) may fire
    // against a track that just started — reschedule instead of scrobbling.
    const now = Date.now();
    const startedAt = currentTrack.startedAt ?? now;
    const durationMs = releaseTrack.durationSec ? releaseTrack.durationSec * 1000 : null;

    if (durationMs) {
      const thresholdMs = (durationMs * SCROBBLE_THRESHOLD_PERCENT) / 100;
      const elapsed = now - startedAt;

      if (elapsed < thresholdMs) {
        // Stale alarm — track hasn't played long enough. Reschedule.
        await this.scheduleAlarmForCurrentTrack(session, now);
        return;
      }
    }

    const scrobbleResult = await scrobbleTrack(
      this.env,
      lastfmSessionKey,
      session.release,
      currentIndex,
      Math.floor(startedAt / 1000)
    );

    if (!scrobbleResult.ok) {
      console.error(`[SessionAlarmDO] Failed to scrobble track ${currentIndex}:`, scrobbleResult.message);
    }

    const advanced = advanceSession(session, now);
    await storeSession(this.env.NOW_SPINNING_KV, advanced);

    if (advanced.state === "ended") {
      return;
    }

    const npResult = await sendNowPlaying(
      this.env,
      lastfmSessionKey,
      advanced.release,
      advanced.currentIndex
    );
    if (!npResult.ok) {
      console.error(`[SessionAlarmDO] Failed to send now playing for track ${advanced.currentIndex}:`, npResult.message);
    }

    await this.scheduleNextAlarm(advanced);
  }

  private async handleStart(cmd: StartCommand): Promise<Response> {
    await this.ctx.storage.put("sessionId", cmd.sessionId);
    await this.ctx.storage.put("userId", cmd.userId);
    await this.ctx.storage.put("lastfmSessionKey", cmd.lastfmSessionKey);

    const session = await loadSession(this.env.NOW_SPINNING_KV, cmd.sessionId);
    if (!session) {
      return new Response("Session not found in KV", { status: 404 });
    }

    await this.scheduleNextAlarm(session);
    return new Response("OK");
  }

  private async handlePause(): Promise<Response> {
    await this.ctx.storage.deleteAlarm();
    return new Response("OK");
  }

  private async handleResume(cmd: ResumeCommand): Promise<Response> {
    const sessionId = await this.ctx.storage.get<string>("sessionId");
    if (!sessionId) {
      return new Response("No session", { status: 400 });
    }

    const session = await loadSession(this.env.NOW_SPINNING_KV, sessionId);
    if (!session || session.state !== "running") {
      return new Response("Session not running", { status: 400 });
    }

    await this.scheduleAlarmForCurrentTrack(session, cmd.resumedAt);
    return new Response("OK");
  }

  private async handleNext(_cmd: NextCommand): Promise<Response> {
    const sessionId = await this.ctx.storage.get<string>("sessionId");
    if (!sessionId) {
      return new Response("No session", { status: 400 });
    }

    await this.ctx.storage.deleteAlarm();

    const session = await loadSession(this.env.NOW_SPINNING_KV, sessionId);
    if (!session || session.state === "ended") {
      return new Response("OK");
    }

    await this.scheduleNextAlarm(session);
    return new Response("OK");
  }

  private async handleEnd(): Promise<Response> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete("sessionId");
    await this.ctx.storage.delete("userId");
    await this.ctx.storage.delete("lastfmSessionKey");
    return new Response("OK");
  }

  private async scheduleNextAlarm(session: Session): Promise<void> {
    if (session.state === "ended") {
      return;
    }

    const now = Date.now();
    await this.scheduleAlarmForCurrentTrack(session, now);
  }

  private async scheduleAlarmForCurrentTrack(session: Session, referenceTime: number): Promise<void> {
    const currentIndex = session.currentIndex;
    const currentTrack = session.tracks[currentIndex];
    const releaseTrack = session.release.tracks[currentIndex];

    if (!currentTrack || !releaseTrack) {
      return;
    }

    const durationMs = releaseTrack.durationSec ? releaseTrack.durationSec * 1000 : null;
    if (!durationMs) {
      return;
    }

    const thresholdMs = (durationMs * SCROBBLE_THRESHOLD_PERCENT) / 100;
    const startedAt = currentTrack.startedAt ?? referenceTime;
    const elapsed = referenceTime - startedAt;
    const remainingMs = Math.max(thresholdMs - elapsed, 1000);

    const alarmTime = referenceTime + remainingMs;
    await this.ctx.storage.setAlarm(alarmTime);
  }
}

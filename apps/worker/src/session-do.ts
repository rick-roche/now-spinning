import { advanceSession, pauseSession, getSideFromTrack, type Session } from "@repo/shared";
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
  thresholdPercent: number;
  notifyOnSideCompletion?: boolean;
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

const DEFAULT_THRESHOLD_PERCENT = 50;
const MINIMUM_SCROBBLE_MS = 30_000; // 30 seconds fallback for unknown durations

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

    const thresholdPercent = (await this.ctx.storage.get<number>("thresholdPercent")) ?? DEFAULT_THRESHOLD_PERCENT;
    const now = Date.now();
    const startedAt = currentTrack.startedAt ?? now;
    const durationMs = releaseTrack.durationSec ? releaseTrack.durationSec * 1000 : null;

    const thresholdMs = durationMs
      ? (durationMs * thresholdPercent) / 100
      : MINIMUM_SCROBBLE_MS;
    const elapsed = now - startedAt;

    if (elapsed < thresholdMs) {
      await this.scheduleAlarmForCurrentTrack(session, now);
      return;
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

    // Use the projected track end time so the next track's startedAt is anchored
    // to when the current track actually finished, not the scrobble threshold point.
    // Without this, each track starts at the 50%-mark of the previous one, causing
    // tracks to scrobble at ~2× speed.
    // Note: scrobbledAt stays as 'now' (the actual scrobble wall-clock time), but
    // the *next* track's startedAt is set to trackEndTime via advanceSession.
    const trackEndTime = durationMs !== null ? startedAt + durationMs : now;

    // Check if the next track is on a different record side. If the user has
    // enabled side-completion notifications, pause instead of auto-advancing so
    // they can flip the record.
    const notifyOnSideCompletion = (await this.ctx.storage.get<boolean>("notifyOnSideCompletion")) ?? true;
    const nextReleaseTrack = session.release.tracks[currentIndex + 1];
    const currentSide = getSideFromTrack(releaseTrack);
    const nextSide = getSideFromTrack(nextReleaseTrack ?? null);

    if (notifyOnSideCompletion && currentSide !== null && nextSide !== null && currentSide !== nextSide) {
      // Pause at side boundary — mark current track scrobbled but do not advance.
      // The client will detect the paused state on next foreground sync and show
      // the "flip the record" modal.
      const updatedTracks = [...session.tracks];
      updatedTracks[currentIndex] = { ...currentTrack, status: "scrobbled", scrobbledAt: now };
      const pausedSession = pauseSession({ ...session, tracks: updatedTracks });
      await storeSession(this.env.NOW_SPINNING_KV, pausedSession);
      return;
    }

    // Set scrobbledAt to now (actual wall-clock scrobble time) while anchoring
    // the next track's startedAt to trackEndTime (projected track end).
    // advanceSession uses its advancedAt argument for both, so we call it with
    // trackEndTime and then patch scrobbledAt back to now.
    const advanced = advanceSession(session, trackEndTime);
    const patchedTracks = [...advanced.tracks];
    const scrobbledTrack = patchedTracks[currentIndex];
    if (scrobbledTrack && scrobbledTrack.status === "scrobbled") {
      patchedTracks[currentIndex] = { ...scrobbledTrack, scrobbledAt: now };
    }
    const advancedPatched = { ...advanced, tracks: patchedTracks };
    await storeSession(this.env.NOW_SPINNING_KV, advancedPatched);

    if (advancedPatched.state === "ended") {
      return;
    }

    const npResult = await sendNowPlaying(
      this.env,
      lastfmSessionKey,
      advancedPatched.release,
      advancedPatched.currentIndex
    );
    if (!npResult.ok) {
      console.error(`[SessionAlarmDO] Failed to send now playing for track ${advancedPatched.currentIndex}:`, npResult.message);
    }

    await this.scheduleNextAlarm(advancedPatched);
  }

  private async handleStart(cmd: StartCommand): Promise<Response> {
    await this.ctx.storage.put("sessionId", cmd.sessionId);
    await this.ctx.storage.put("userId", cmd.userId);
    await this.ctx.storage.put("lastfmSessionKey", cmd.lastfmSessionKey);
    await this.ctx.storage.put("thresholdPercent", cmd.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT);
    await this.ctx.storage.put("notifyOnSideCompletion", cmd.notifyOnSideCompletion ?? true);

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
    await this.ctx.storage.delete("thresholdPercent");
    await this.ctx.storage.delete("notifyOnSideCompletion");
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

    const thresholdPercent = (await this.ctx.storage.get<number>("thresholdPercent")) ?? DEFAULT_THRESHOLD_PERCENT;
    const durationMs = releaseTrack.durationSec ? releaseTrack.durationSec * 1000 : null;
    const thresholdMs = durationMs
      ? (durationMs * thresholdPercent) / 100
      : MINIMUM_SCROBBLE_MS;

    const startedAt = currentTrack.startedAt ?? referenceTime;
    const elapsed = referenceTime - startedAt;
    const remainingMs = Math.max(thresholdMs - elapsed, 1000);

    const alarmTime = referenceTime + remainingMs;
    await this.ctx.storage.setAlarm(alarmTime);
  }
}

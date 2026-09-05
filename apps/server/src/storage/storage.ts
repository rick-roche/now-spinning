import { endSession, type Session, type StoredToken } from "@repo/shared";
import type { SqliteDatabase } from "./database.js";
import { decryptJson, encryptJson, StorageCryptoError } from "./crypto.js";

export interface StoredTokens {
  lastfm: StoredToken | null;
  discogs: StoredToken | null;
}

export interface ScheduleRecord {
  sessionId: string;
  thresholdPercent: number;
  notifyOnSideCompletion: boolean;
  dueAt: number | null;
  updatedAt: number;
}

const SCHEDULER_LEASE_NAME = "session-scheduler";
const SCROBBLE_DEDUPLICATION_TTL_MS = 86_400_000;
const SESSION_MUTATION_TTL_MS = 86_400_000;

export class SQLiteStorage {
  constructor(private readonly db: SqliteDatabase, private readonly encryptionKey: Buffer) {}

  close(): void { this.db.close(); }

  acquireSchedulerLease(ownerId: string, now = Date.now(), durationMs = 60_000): boolean {
    const result = this.db.prepare(`
      INSERT INTO scheduler_leases(name, owner_id, lease_until, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        owner_id = excluded.owner_id,
        lease_until = excluded.lease_until,
        updated_at = excluded.updated_at
      WHERE scheduler_leases.lease_until <= ? OR scheduler_leases.owner_id = ?
    `).run(SCHEDULER_LEASE_NAME, ownerId, now + durationMs, now, now, ownerId);
    return result.changes === 1;
  }

  renewSchedulerLease(ownerId: string, now = Date.now(), durationMs = 60_000): boolean {
    const result = this.db.prepare(`
      UPDATE scheduler_leases
      SET lease_until = ?, updated_at = ?
      WHERE name = ? AND owner_id = ? AND lease_until > ?
    `).run(now + durationMs, now, SCHEDULER_LEASE_NAME, ownerId, now);
    return result.changes === 1;
  }

  ownsSchedulerLease(ownerId: string, now = Date.now()): boolean {
    const row = this.db.prepare("SELECT 1 FROM scheduler_leases WHERE name = ? AND owner_id = ? AND lease_until > ?")
      .get(SCHEDULER_LEASE_NAME, ownerId, now);
    return row !== undefined;
  }

  releaseSchedulerLease(ownerId: string): void {
    this.db.prepare("DELETE FROM scheduler_leases WHERE name = ? AND owner_id = ?").run(SCHEDULER_LEASE_NAME, ownerId);
  }

  loadTokens(userId: string): StoredTokens {
    const row = this.db.prepare("SELECT json FROM tokens WHERE user_id = ?").get(userId) as { json: string } | undefined;
    if (!row) return { lastfm: null, discogs: null };
    if (row.json.startsWith("v1:")) return decryptJson<StoredTokens>(row.json, this.encryptionKey, `tokens:${userId}`);
    let tokens: StoredTokens;
    try { tokens = JSON.parse(row.json) as StoredTokens; } catch { throw new StorageCryptoError("Stored token data is invalid"); }
    this.storeTokens(userId, tokens);
    return tokens;
  }

  storeTokens(userId: string, tokens: StoredTokens): void {
    this.db.prepare("INSERT INTO tokens(user_id,json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at")
      .run(userId, encryptJson(tokens, this.encryptionKey, `tokens:${userId}`), Date.now());
  }

  storeOAuthState(service: string, state: string, metadata: Record<string, string>, ttlSeconds = 600): void {
    this.cleanupOAuthStates();
    this.db.prepare("INSERT OR REPLACE INTO oauth_states(service,state,metadata_json,expires_at) VALUES(?,?,?,?)")
      .run(service, state, encryptJson(metadata, this.encryptionKey, `oauth:${service}:${state}`), Date.now() + ttlSeconds * 1000);
  }

  consumeOAuthState(service: string, state: string): Record<string, string> | null {
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare("SELECT metadata_json, expires_at FROM oauth_states WHERE service = ? AND state = ?")
        .get(service, state) as { metadata_json: string; expires_at: number } | undefined;
      this.db.prepare("DELETE FROM oauth_states WHERE service = ? AND state = ?").run(service, state);
      if (!row || row.expires_at <= Date.now()) return null;
      if (row.metadata_json.startsWith("v1:")) return decryptJson<Record<string, string>>(row.metadata_json, this.encryptionKey, `oauth:${service}:${state}`);
      return JSON.parse(row.metadata_json) as Record<string, string>;
    });
    return transaction();
  }

  private cleanupOAuthStates(): void {
    this.db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(Date.now());
  }

  saveSession(session: Session): void {
    this.db.prepare("INSERT INTO sessions(id,user_id,session_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, session_json=excluded.session_json, updated_at=excluded.updated_at")
      .run(session.id, session.userId, JSON.stringify(session), Date.now());
  }

  loadSessionMutation<T>(userId: string, sessionId: string, mutationId: string, action: string, now = Date.now()): T | null {
    this.db.prepare("DELETE FROM session_mutations WHERE expires_at <= ?").run(now);
    const row = this.db.prepare("SELECT response_json, action FROM session_mutations WHERE user_id = ? AND session_id = ? AND mutation_id = ?")
      .get(userId, sessionId, mutationId) as { response_json: string; action: string } | undefined;
    if (!row || row.action !== action) return null;
    try { return JSON.parse(row.response_json) as T; } catch { return null; }
  }

  saveSessionMutation<T>(session: Session, mutationId: string, action: string, response: T, now = Date.now()): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare("INSERT INTO sessions(id,user_id,session_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, session_json=excluded.session_json, updated_at=excluded.updated_at")
        .run(session.id, session.userId, JSON.stringify(session), now);
      this.db.prepare("INSERT INTO session_mutations(user_id,session_id,mutation_id,action,response_json,expires_at) VALUES(?,?,?,?,?,?)")
        .run(session.userId, session.id, mutationId, action, JSON.stringify(response), now + SESSION_MUTATION_TTL_MS);
    });
    transaction();
  }

  startSession(session: Session, thresholdPercent: number, notifyOnSideCompletion: boolean): void {
    const now = Date.now();
    const transaction = this.db.transaction(() => {
      const previousSessions = this.db.prepare("SELECT id, session_json FROM sessions WHERE user_id = ? AND id != ?")
        .all(session.userId, session.id) as Array<{ id: string; session_json: string }>;
      for (const row of previousSessions) {
        let previous: Session | null = null;
        try { previous = JSON.parse(row.session_json) as Session; } catch { /* loadSession treats corrupt history as unavailable */ }
        if (previous && previous.state !== "ended") {
          this.db.prepare("UPDATE sessions SET session_json = ?, updated_at = ? WHERE id = ?")
            .run(JSON.stringify(endSession(previous)), now, previous.id);
        }
        this.db.prepare("DELETE FROM session_schedules WHERE session_id = ?").run(row.id);
      }

      this.db.prepare("INSERT INTO sessions(id,user_id,session_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, session_json=excluded.session_json, updated_at=excluded.updated_at")
        .run(session.id, session.userId, JSON.stringify(session), now);
      this.db.prepare("INSERT INTO current_sessions(user_id,session_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET session_id=excluded.session_id")
        .run(session.userId, session.id);
      this.db.prepare("INSERT INTO session_schedules(session_id,threshold_percent,notify_on_side_completion,due_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET threshold_percent=excluded.threshold_percent, notify_on_side_completion=excluded.notify_on_side_completion, due_at=excluded.due_at, updated_at=excluded.updated_at")
        .run(session.id, thresholdPercent, notifyOnSideCompletion ? 1 : 0, null, now);
    });
    transaction();
  }

  loadSession(sessionId: string): Session | null {
    const row = this.db.prepare("SELECT session_json FROM sessions WHERE id = ?").get(sessionId) as { session_json: string } | undefined;
    if (!row) return null;
    try {
      const session = JSON.parse(row.session_json) as Session;
      return { ...session, revision: session.revision ?? 0 };
    } catch { return null; }
  }

  loadCurrentSession(userId: string): Session | null {
    const row = this.db.prepare("SELECT session_id FROM current_sessions WHERE user_id = ?").get(userId) as { session_id: string } | undefined;
    return row ? this.loadSession(row.session_id) : null;
  }

  isCurrentSession(userId: string, sessionId: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM current_sessions WHERE user_id = ? AND session_id = ?")
      .get(userId, sessionId);
    return row !== undefined;
  }

  saveSchedule(record: ScheduleRecord): void {
    this.db.prepare("INSERT INTO session_schedules(session_id,threshold_percent,notify_on_side_completion,due_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET threshold_percent=excluded.threshold_percent, notify_on_side_completion=excluded.notify_on_side_completion, due_at=excluded.due_at, updated_at=excluded.updated_at")
      .run(record.sessionId, record.thresholdPercent, record.notifyOnSideCompletion ? 1 : 0, record.dueAt, record.updatedAt);
  }

  loadSchedule(sessionId: string): ScheduleRecord | null {
    const row = this.db.prepare("SELECT session_id,threshold_percent,notify_on_side_completion,due_at,updated_at FROM session_schedules WHERE session_id = ?")
      .get(sessionId) as { session_id: string; threshold_percent: number; notify_on_side_completion: number; due_at: number | null; updated_at: number } | undefined;
    return row ? { sessionId: row.session_id, thresholdPercent: row.threshold_percent, notifyOnSideCompletion: row.notify_on_side_completion === 1, dueAt: row.due_at, updatedAt: row.updated_at } : null;
  }

  loadSchedules(): ScheduleRecord[] {
    const rows = this.db.prepare("SELECT session_id,threshold_percent,notify_on_side_completion,due_at,updated_at FROM session_schedules ORDER BY due_at").all() as Array<{ session_id: string; threshold_percent: number; notify_on_side_completion: number; due_at: number | null; updated_at: number }>;
    return rows.map((row) => ({ sessionId: row.session_id, thresholdPercent: row.threshold_percent, notifyOnSideCompletion: row.notify_on_side_completion === 1, dueAt: row.due_at, updatedAt: row.updated_at }));
  }

  deleteSchedule(sessionId: string): void { this.db.prepare("DELETE FROM session_schedules WHERE session_id = ?").run(sessionId); }

  claimScrobble(scrobbleId: string, userId: string, createdAt = Date.now()): "claimed" | "delivered" | "in_flight" {
    this.db.prepare("DELETE FROM scrobble_deliveries WHERE expires_at <= ?").run(createdAt);
    const result = this.db.prepare(
      "INSERT OR IGNORE INTO scrobble_deliveries(scrobble_id,user_id,status,created_at,delivered_at,expires_at) VALUES(?,?,?, ?, NULL, ?)"
    ).run(scrobbleId, userId, "in_flight", createdAt, createdAt + SCROBBLE_DEDUPLICATION_TTL_MS);
    if (result.changes === 1) return "claimed";
    const row = this.db.prepare("SELECT status FROM scrobble_deliveries WHERE scrobble_id = ?")
      .get(scrobbleId) as { status: "in_flight" | "delivered" };
    return row.status;
  }

  completeScrobble(scrobbleId: string, deliveredAt = Date.now()): void {
    this.db.prepare("UPDATE scrobble_deliveries SET status = 'delivered', delivered_at = ? WHERE scrobble_id = ? AND status = 'in_flight'")
      .run(deliveredAt, scrobbleId);
  }

  releaseScrobble(scrobbleId: string): void {
    this.db.prepare("DELETE FROM scrobble_deliveries WHERE scrobble_id = ? AND status = 'in_flight'").run(scrobbleId);
  }

  getCache<T>(key: string): T | null {
    const row = this.db.prepare("SELECT json, expires_at FROM cache_entries WHERE key = ?").get(key) as { json: string; expires_at: number } | undefined;
    if (!row) return null;
    if (row.expires_at <= Date.now()) { this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key); return null; }
    try { return JSON.parse(row.json) as T; } catch {
      this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key);
      return null;
    }
  }

  setCache(key: string, value: unknown, ttlSeconds: number): void {
    this.db.prepare("DELETE FROM cache_entries WHERE expires_at <= ?").run(Date.now());
    this.db.prepare("INSERT OR REPLACE INTO cache_entries(key,json,expires_at) VALUES(?,?,?)").run(key, JSON.stringify(value), Date.now() + ttlSeconds * 1000);
  }

  deleteCache(key: string): void { this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key); }

}

import type { Session, StoredToken } from "@repo/shared";
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
    const transaction = this.db.transaction(() => {
      this.db.prepare("INSERT INTO sessions(id,user_id,session_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, session_json=excluded.session_json, updated_at=excluded.updated_at")
        .run(session.id, session.userId, JSON.stringify(session), Date.now());
      this.db.prepare("INSERT INTO current_sessions(user_id,session_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET session_id=excluded.session_id")
        .run(session.userId, session.id);
    });
    transaction();
  }

  loadSession(sessionId: string): Session | null {
    const row = this.db.prepare("SELECT session_json FROM sessions WHERE id = ?").get(sessionId) as { session_json: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.session_json) as Session; } catch { return null; }
  }

  loadCurrentSession(userId: string): Session | null {
    const row = this.db.prepare("SELECT session_id FROM current_sessions WHERE user_id = ?").get(userId) as { session_id: string } | undefined;
    return row ? this.loadSession(row.session_id) : null;
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

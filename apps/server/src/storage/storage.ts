import type { Session, StoredToken } from "@repo/shared";
import type { SqliteDatabase } from "./database.js";

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

export class SQLiteStorage {
  constructor(private readonly db: SqliteDatabase) {}

  close(): void { this.db.close(); }

  loadTokens(userId: string): StoredTokens {
    const row = this.db.prepare("SELECT json FROM tokens WHERE user_id = ?").get(userId) as { json: string } | undefined;
    return row ? JSON.parse(row.json) as StoredTokens : { lastfm: null, discogs: null };
  }

  storeTokens(userId: string, tokens: StoredTokens): void {
    this.db.prepare("INSERT INTO tokens(user_id,json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at")
      .run(userId, JSON.stringify(tokens), Date.now());
  }

  storeOAuthState(service: string, state: string, metadata: Record<string, string>, ttlSeconds = 600): void {
    this.cleanupOAuthStates();
    this.db.prepare("INSERT OR REPLACE INTO oauth_states(service,state,metadata_json,expires_at) VALUES(?,?,?,?)")
      .run(service, state, JSON.stringify(metadata), Date.now() + ttlSeconds * 1000);
  }

  consumeOAuthState(service: string, state: string): Record<string, string> | null {
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare("SELECT metadata_json, expires_at FROM oauth_states WHERE service = ? AND state = ?")
        .get(service, state) as { metadata_json: string; expires_at: number } | undefined;
      this.db.prepare("DELETE FROM oauth_states WHERE service = ? AND state = ?").run(service, state);
      if (!row || row.expires_at <= Date.now()) return null;
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
    return row ? JSON.parse(row.session_json) as Session : null;
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
    return JSON.parse(row.json) as T;
  }

  setCache(key: string, value: unknown, ttlSeconds: number): void {
    this.db.prepare("INSERT OR REPLACE INTO cache_entries(key,json,expires_at) VALUES(?,?,?)").run(key, JSON.stringify(value), Date.now() + ttlSeconds * 1000);
  }

  deleteCache(key: string): void { this.db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key); }

}

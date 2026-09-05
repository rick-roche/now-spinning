import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type SqliteDatabase = Database.Database;

export function openDatabase(path: string): SqliteDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      user_id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      service TEXT NOT NULL,
      state TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (service, state)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS current_sessions (
      user_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_schedules (
      session_id TEXT PRIMARY KEY,
      threshold_percent REAL NOT NULL,
      notify_on_side_completion INTEGER NOT NULL,
      due_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scrobble_deliveries (
      scrobble_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_flight', 'delivered')),
      created_at INTEGER NOT NULL,
      delivered_at INTEGER,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduler_leases (
      name TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      lease_until INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cache_entries (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  const deliveryColumns = database.prepare("PRAGMA table_info(scrobble_deliveries)").all() as Array<{ name: string }>;
  if (!deliveryColumns.some((column) => column.name === "expires_at")) {
    database.exec("ALTER TABLE scrobble_deliveries ADD COLUMN expires_at INTEGER");
    database.prepare("UPDATE scrobble_deliveries SET expires_at = created_at + ? WHERE expires_at IS NULL")
      .run(86_400_000);
  }
  return database;
}

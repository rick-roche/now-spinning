import type { AppConfig } from "./config.js";
import type { SQLiteStorage } from "./storage/storage.js";
import type { SessionScheduler } from "./scheduler/session-scheduler.js";

export interface AppEnvironment extends AppConfig {
  NOW_SPINNING_STORAGE: SQLiteStorage;
  scheduler: SessionScheduler;
  PUBLIC_APP_ORIGIN: string;
  LASTFM_CALLBACK_URL: string;
  DISCOGS_CALLBACK_URL: string;
  DEV_MODE: string;
  LASTFM_API_KEY?: string | undefined;
  LASTFM_API_SECRET?: string | undefined;
  DISCOGS_CONSUMER_KEY?: string | undefined;
  DISCOGS_CONSUMER_SECRET?: string | undefined;
}

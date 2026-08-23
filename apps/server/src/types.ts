import type { AppConfig } from "./config.js";
import type { SQLiteStorage } from "./storage/storage.js";
import type { SessionScheduler } from "./scheduler/session-scheduler.js";

export interface AppEnvironment extends AppConfig {
  NOW_SPINNING_STORAGE: SQLiteStorage;
  scheduler: SessionScheduler;
}

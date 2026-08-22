import { serve } from "@hono/node-server";
import { openDatabase } from "./storage/database.js";
import { SQLiteStorage } from "./storage/storage.js";
import { loadConfig } from "./config.js";
import { SessionScheduler } from "./scheduler/session-scheduler.js";
import { createApp } from "./app.js";
import type { AppEnvironment } from "./types.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
const storage = new SQLiteStorage(database, config.tokenEncryptionKey);
const environment = {
  ...config,
  NOW_SPINNING_STORAGE: storage,
  PUBLIC_APP_ORIGIN: config.publicAppOrigin,
  LASTFM_CALLBACK_URL: config.lastfmCallbackUrl,
  DISCOGS_CALLBACK_URL: config.discogsCallbackUrl,
  DEV_MODE: String(config.devMode),
  LASTFM_API_KEY: config.lastfmApiKey,
  LASTFM_API_SECRET: config.lastfmApiSecret,
  DISCOGS_CONSUMER_KEY: config.discogsConsumerKey,
  DISCOGS_CONSUMER_SECRET: config.discogsConsumerSecret,
} as AppEnvironment;
const scheduler = new SessionScheduler(storage, environment);
environment.scheduler = scheduler;
const app = createApp(environment);

await scheduler.start();
const server = serve({ fetch: (request) => app.fetch(request, environment), port: config.port, hostname: "0.0.0.0" });
console.log(`Now Spinning server listening on http://0.0.0.0:${config.port}`);

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await scheduler.stop();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  storage.close();
}

process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)).catch(() => process.exit(1)));
process.once("SIGINT", () => void shutdown().then(() => process.exit(0)).catch(() => process.exit(1)));

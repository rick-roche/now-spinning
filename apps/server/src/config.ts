export interface AppConfig {
  port: number;
  databasePath: string;
  tokenEncryptionKey: Buffer;
  publicAppOrigin: string;
  lastfmCallbackUrl: string;
  discogsCallbackUrl: string;
  lastfmApiKey?: string | undefined;
  lastfmApiSecret?: string | undefined;
  discogsConsumerKey?: string | undefined;
  discogsConsumerSecret?: string | undefined;
  allowedOrigins: string[];
  devMode: boolean;
  staticRoot: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function booleanEnv(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number.parseInt(env.PORT ?? "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");

  const isProduction = env.NODE_ENV === "production";
  const publicAppOrigin = required("PUBLIC_APP_ORIGIN", env.PUBLIC_APP_ORIGIN ?? (isProduction ? undefined : "http://localhost:5173"));
  const lastfmCallbackUrl = required(
    "LASTFM_CALLBACK_URL",
    env.LASTFM_CALLBACK_URL ?? (isProduction ? undefined : "http://localhost:3000/api/auth/lastfm/callback")
  );
  const discogsCallbackUrl = required(
    "DISCOGS_CALLBACK_URL",
    env.DISCOGS_CALLBACK_URL ?? (isProduction ? undefined : "http://localhost:3000/api/auth/discogs/callback")
  );
  const tokenEncryptionKeyValue = required("TOKEN_ENCRYPTION_KEY", env.TOKEN_ENCRYPTION_KEY);
  const tokenEncryptionKey = Buffer.from(tokenEncryptionKeyValue, "base64");
  if (tokenEncryptionKey.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");

  return {
    port,
    databasePath: env.DATABASE_PATH ?? (env.NODE_ENV === "production" ? "/data/now-spinning.sqlite" : "./data/now-spinning.sqlite"),
    tokenEncryptionKey,
    publicAppOrigin,
    lastfmCallbackUrl,
    discogsCallbackUrl,
    lastfmApiKey: env.LASTFM_API_KEY,
    lastfmApiSecret: env.LASTFM_API_SECRET,
    discogsConsumerKey: env.DISCOGS_CONSUMER_KEY,
    discogsConsumerSecret: env.DISCOGS_CONSUMER_SECRET,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    devMode: booleanEnv("DEV_MODE", env.DEV_MODE, false),
    staticRoot: env.STATIC_ROOT ?? new URL("../../web/dist", import.meta.url).pathname,
  };
}

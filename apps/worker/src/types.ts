/**
 * Cloudflare bindings and environment types.
 */

export interface CloudflareBinding {
  // KV Namespace
  NOW_SPINNING_KV: KVNamespace;

  // Environment variables (from wrangler.toml [vars])
  PUBLIC_APP_ORIGIN: string;
  LASTFM_CALLBACK_URL: string;
  DISCOGS_CALLBACK_URL: string;
  ALLOWED_ORIGINS?: string;
  DEV_MODE?: string;

  // Secrets (from wrangler secret put)
  LASTFM_API_KEY?: string;
  LASTFM_API_SECRET?: string;
  DISCOGS_CONSUMER_KEY?: string;
  DISCOGS_CONSUMER_SECRET?: string;
}

/**
 * Shared Discogs constants and helpers used across worker routes.
 */

import type { Context } from "hono";
import type { CloudflareBinding } from "../types.js";

type HonoContext = Context<{ Bindings: CloudflareBinding }>;

export const DISCOGS_API_BASE = "https://api.discogs.com";
export const DISCOGS_USER_AGENT = "NowSpinning/0.0.1 +now-spinning.dev";

export function getDiscogsAppCredentials(
  c: HonoContext
): { consumerKey: string; consumerSecret: string } | null {
  const consumerKey = c.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = c.env.DISCOGS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    return null;
  }

  return { consumerKey, consumerSecret };
}

export function createAppAuthHeader(consumerKey: string, consumerSecret: string): string {
  return `Discogs key=${consumerKey}, secret=${consumerSecret}`;
}

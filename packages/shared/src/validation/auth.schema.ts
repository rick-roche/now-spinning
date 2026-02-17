/**
 * Authentication validation schemas.
 * Validates OAuth callback parameters and disconnect requests.
 */

import { z } from "zod";

/**
 * Last.fm OAuth callback query parameters.
 * Last.fm returns: ?token=<session_key>&error=<error_message>
 */
export const LastFmCallbackQuerySchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
});

export type LastFmCallbackQuery = z.infer<typeof LastFmCallbackQuerySchema>;

/**
 * Discogs OAuth callback query parameters.
 * Discogs returns: ?oauth_token=<token>&oauth_verifier=<verifier>&error=<error>&error_description=<desc>
 */
export const DiscogsCallbackQuerySchema = z.object({
  oauth_token: z.string().optional(),
  oauth_verifier: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type DiscogsCallbackQuery = z.infer<typeof DiscogsCallbackQuerySchema>;

/**
 * Generic OAuth callback query parameters.
 * Used for common validation patterns.
 */
export const OAuthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type OAuthCallbackQuery = z.infer<typeof OAuthCallbackQuerySchema>;

/**
 * Disconnect request body (empty).
 * Service is determined from the route.
 */
export const DisconnectRequestSchema = z.object({}).strict();

export type DisconnectRequest = z.infer<typeof DisconnectRequestSchema>;

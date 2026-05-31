/**
 * Session validation schemas.
 * Validates session start requests and session IDs.
 */

import { z } from "zod";

/**
 * Session start request body.
 * Requires a valid Discogs release ID.
 */
export const SessionStartRequestSchema = z.object({
  releaseId: z.string().trim().min(1, "Release ID is required"),
  thresholdPercent: z.number().min(0).max(100).optional().default(50),
  notifyOnSideCompletion: z.boolean().optional().default(true),
});

/**
 * Session sync request body.
 * Sent by the client when resuming from background to catch up on missed scrobbles.
 */
export const SessionSyncRequestSchema = z.object({
  thresholdPercent: z.number().min(0).max(100).optional().default(50),
  notifyOnSideCompletion: z.boolean().optional().default(true),
});

export type SessionSyncRequest = z.infer<typeof SessionSyncRequestSchema>;

/**
 * Session ID validation.
 * Session IDs are UUIDs generated server-side.
 */
export const SessionIdSchema = z.string().trim().min(1, "Session ID is required");

export type SessionId = z.infer<typeof SessionIdSchema>;

/**
 * Session path parameter validation.
 * Used for routes like /session/:id/pause
 */
export const SessionParamSchema = z.object({
  id: SessionIdSchema,
});

export type SessionParam = z.infer<typeof SessionParamSchema>;

/**
 * Session scrobble-current request body.
 * Requires elapsed time to validate scrobble eligibility.
 * Threshold percent is optional and defaults to 50%.
 */
export const SessionScrobbleCurrentRequestSchema = z.object({
  elapsedMs: z.number().min(0, "Elapsed time must be non-negative"),
  thresholdPercent: z.number().min(0).max(100).optional().default(50),
});

export type SessionScrobbleCurrentRequest = z.infer<typeof SessionScrobbleCurrentRequestSchema>;

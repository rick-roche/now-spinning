/**
 * Validation schemas for request parameters and bodies.
 * Export all schemas used across the application.
 */

export {
  LastFmCallbackQuerySchema,
  DiscogsCallbackQuerySchema,
  OAuthCallbackQuerySchema,
  DisconnectRequestSchema,
} from "./auth.schema.js";

export {
  DiscogsCollectionQuerySchema,
  DiscogsSearchQuerySchema,
  DiscogsReleaseIdSchema,
  DiscogsReleaseParamSchema,
  type DiscogsCollectionQuery,
  type DiscogsSearchQuery,
  type DiscogsReleaseId,
  type DiscogsReleaseParam,
} from "./discogs.schema.js";

export {
  SessionStartRequestSchema,
  SessionIdSchema,
  SessionParamSchema,
  SessionScrobbleCurrentRequestSchema,
  type SessionId,
  type SessionParam,
  type SessionScrobbleCurrentRequest,
} from "./session.schema.js";

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
  DiscogsCollectionSortFieldSchema,
  DiscogsCollectionSortDirSchema,
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
  SessionMutationRequestSchema,
  SessionEndRequestSchema,
  SessionScrobbleCurrentRequestSchema,
  SessionScrobbleNowRequestSchema,
  SessionSyncRequestSchema,
  type SessionId,
  type SessionParam,
  type SessionMutationRequest,
  type SessionScrobbleCurrentRequest,
} from "./session.schema.js";

export {
  DirectScrobbleRequestSchema,
  type DirectScrobbleRequestInput,
} from "./scrobble.schema.js";

export { RecentScrobblesQuerySchema, type RecentScrobblesQuery } from "./recent-scrobbles.schema.js";

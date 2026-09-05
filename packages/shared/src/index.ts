// Domain types
export type {
  NormalizedRelease,
  NormalizedTrack,
  PhysicalMediaType,
} from "./domain/release.js";
export type {
  Session,
  SessionState,
  SessionTrackState,
  SessionTrackStatus,
} from "./domain/session.js";
export {
  advanceSession,
  createSession,
  endSession,
  pauseSession,
  resumeSession,
} from "./session/engine.js";
export {
  isEligibleToScrobble,
  getScrobbleThresholdMs,
  isScrobblableDuration,
} from "./session/eligibility.js";
export { syncSession } from "./session/sync.js";
export type { SyncScrobbleAction, SyncSessionResult } from "./session/sync.js";
export { getPhysicalMediaBoundary, getSideFromTrack } from "./session/utils.js";
export type { PhysicalMediaBoundary } from "./session/utils.js";

// Contracts
export type { APIError } from "./contracts/errors.js";
export { createAPIError, ErrorCode } from "./contracts/errors.js";
export type {
  AuthStatusResponse,
  DisconnectRequest,
  DisconnectResponse,
  DiscogsConfig,
  LastFmConfig,
  OAuthCallbackQuery,
  OAuthStartRequest,
  OAuthStartResponse,
  StoredToken,
  UserSession,
} from "./contracts/auth.js";
export type {
  DiscogsCollectionItem,
  DiscogsCollectionSortDir,
  DiscogsCollectionSortField,
  DiscogsCollectionResponse,
  DiscogsReleaseResponse,
  DiscogsMasterVersion,
  DiscogsMasterVersionsResponse,
  DiscogsSearchItem,
  DiscogsSearchResponse,
} from "./contracts/discogs.js";
export type {
  SessionActionResponse,
  SessionEndMode,
  SessionEndRequest,
  SessionCurrentResponse,
  SessionStartRequest,
  SessionStartResponse,
  SessionSyncResponse,
} from "./contracts/session.js";

export type { DiscogsReleaseApiResponse } from "./normalize/discogsRelease.js";
export {
  derivePhysicalMediaType,
  formatDiscogsFormats,
  mergeMissingTrackDurations,
  normalizeDiscogsRelease,
  parseDiscogsDuration,
} from "./normalize/discogsRelease.js";
export { stripDiscogsDisambiguation } from "./normalize/artistName.js";

// Validation schemas
export {
  LastFmCallbackQuerySchema,
  DiscogsCallbackQuerySchema,
  OAuthCallbackQuerySchema,
  DisconnectRequestSchema,
} from "./validation/index.js";
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
} from "./validation/index.js";
export {
  SessionStartRequestSchema,
  SessionIdSchema,
  SessionParamSchema,
  SessionScrobbleCurrentRequestSchema,
  SessionMutationRequestSchema,
  SessionEndRequestSchema,
  SessionSyncRequestSchema,
  type SessionId,
  type SessionParam,
  type SessionScrobbleCurrentRequest,
  type SessionMutationRequest,
} from "./validation/index.js";

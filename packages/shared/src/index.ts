// Domain types
export type {
  NormalizedRelease,
  NormalizedTrack,
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
  pauseSession,
  resumeSession,
} from "./session/engine.js";

// Contracts
export type { APIError } from "./contracts/errors.js";
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
  DiscogsCollectionResponse,
  DiscogsReleaseResponse,
  DiscogsSearchItem,
  DiscogsSearchResponse,
} from "./contracts/discogs.js";
export type {
  SessionActionResponse,
  SessionCurrentResponse,
  SessionStartRequest,
  SessionStartResponse,
} from "./contracts/session.js";

export type { DiscogsReleaseApiResponse } from "./normalize/discogsRelease.js";
export { normalizeDiscogsRelease, parseDiscogsDuration } from "./normalize/discogsRelease.js";

/**
 * Authentication contracts - shared between Worker and SPA.
 * Defines request/response shapes for OAuth flows and auth status.
 */

/** Stored token info (server-side only) */
export interface StoredToken {
  /** Service: "lastfm" or "discogs" */
  service: "lastfm" | "discogs";
  /** Access token, session key, or equivalent */
  accessToken: string;
  /** Secret (Discogs) or undefined (Last.fm session key) */
  accessTokenSecret?: string;
  /** When the token was stored (epoch ms) */
  storedAt: number;
  /** When token expires, if applicable (epoch ms) */
  expiresAt?: number;
}

/** Internal user/session identifier */
export interface UserSession {
  /** Internal user ID (derived from secure cookie) */
  userId: string;
  /** Tokens keyed by service */
  tokens: Record<"lastfm" | "discogs", StoredToken | null>;
}

/** Auth status query response */
export interface AuthStatusResponse {
  lastfmConnected: boolean;
  discogsConnected: boolean;
}

/** OAuth start request (initiates the flow) */
export interface OAuthStartRequest {
  // Empty; state and PKCE generated server-side
  __empty?: never;
}

/** OAuth start response (redirect URL) */
export interface OAuthStartResponse {
  /** URL user should be redirected to (OAuth provider) */
  redirectUrl: string;
}

/** OAuth callback query params */
export interface OAuthCallbackQuery {
  /** Authorization code from provider */
  code?: string;
  /** PKCE code verifier (Last.fm) */
  verifier?: string;
  /** State token (CSRF protection) */
  state?: string;
  /** Error from provider (if denied) */
  error?: string;
  /** Error description */
  error_description?: string;
}

/** Disconnect request */
export interface DisconnectRequest {
  // Empty; service determined from route
  __empty?: never;
}

/** Disconnect response */
export interface DisconnectResponse {
  success: boolean;
}

/**
 * Last.fm specific OAuth config.
 * Define in env vars.
 */
export interface LastFmConfig {
  apiKey: string;
  sharedSecret: string;
  callbackUrl: string;
}

/**
 * Discogs specific OAuth config.
 * Define in env vars.
 */
export interface DiscogsConfig {
  consumerKey: string;
  consumerSecret: string;
  callbackUrl: string;
}

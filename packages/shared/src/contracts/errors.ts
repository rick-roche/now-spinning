/**
 * Centralized error codes used across Worker routes.
 */
export const ErrorCode = {
  AUTH_DENIED: "AUTH_DENIED",
  CONFIG_ERROR: "CONFIG_ERROR",
  DISCOGS_ERROR: "DISCOGS_ERROR",
  DISCOGS_NOT_CONNECTED: "DISCOGS_NOT_CONNECTED",
  DISCOGS_RATE_LIMIT: "DISCOGS_RATE_LIMIT",
  INVALID_QUERY: "INVALID_QUERY",
  INVALID_RELEASE_ID: "INVALID_RELEASE_ID",
  INVALID_STATE: "INVALID_STATE",
  INVALID_TRACK_INDEX: "INVALID_TRACK_INDEX",
  LASTFM_ERROR: "LASTFM_ERROR",
  LASTFM_NOT_CONNECTED: "LASTFM_NOT_CONNECTED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

/**
 * Standard API error response shape.
 * Returned by Worker endpoints for all errors.
 */
export interface APIError {
  error: {
    /** Stable error code for client-side handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Optional request ID for debugging */
    requestId?: string;
    /** Optional validation/detail information */
    details?: unknown;
  };
}

/**
 * Create a standardized API error response with generated request ID.
 */
export function createAPIError(
  code: string,
  message: string,
  details?: unknown
): APIError {
  return {
    error: {
      code,
      message,
      requestId: crypto.randomUUID(),
      ...(details !== undefined && { details }),
    },
  };
}

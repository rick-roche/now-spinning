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
  };
}

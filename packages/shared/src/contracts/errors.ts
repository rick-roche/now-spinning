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

/**
 * Create a standardized API error response with generated request ID.
 */
export function createAPIError(
  code: string,
  message: string,
  includeRequestId: boolean = true
): APIError {
  return {
    error: {
      code,
      message,
      ...(includeRequestId && { requestId: crypto.randomUUID() }),
    },
  };
}

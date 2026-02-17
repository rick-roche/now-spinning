/**
 * HTTP client utilities with retry logic, timeout support, and type safety.
 */

/**
 * Configuration for fetch operations with retry and timeout.
 */
export interface FetchConfig {
  /**
   * Maximum number of retry attempts (default: 3).
   * Total attempts = initialAttempt + maxRetries.
   */
  maxRetries?: number;

  /**
   * Initial delay between retries in milliseconds (default: 100).
   * Delays follow exponential backoff: initialDelay * (2 ^ retryCount)
   */
  initialDelayMs?: number;

  /**
   * Request timeout in milliseconds (default: 30000 / 30 seconds).
   * Uses AbortController to cancel requests.
   */
  timeoutMs?: number;

  /**
   * Retry on specific HTTP status codes (default: [408, 429, 500, 502, 503, 504]).
   * 408 = Request Timeout
   * 429 = Too Many Requests
   * 5xx = Server errors
   */
  retryStatusCodes?: number[];

  /**
   * Whether to retry on network errors (default: true).
   */
  retryOnNetworkError?: boolean;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Required<FetchConfig> = {
  maxRetries: 3,
  initialDelayMs: 100,
  timeoutMs: 30000,
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
  retryOnNetworkError: true,
};

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay.
 * Formula: initialDelay * (2 ^ retryCount)
 */
function calculateBackoffDelay(initialDelay: number, retryCount: number): number {
  return initialDelay * Math.pow(2, retryCount);
}

/**
 * Fetch with automatic retry, exponential backoff, and timeout support.
 *
 * Features:
 * - Exponential backoff for retries
 * - Configurable timeout with AbortController
 * - Automatic retry on network errors and specific status codes
 * - Type-safe JSON deserialization
 *
 * @param url - The URL to fetch
 * @param config - Optional configuration
 * @returns Response object
 *
 * @example
 * ```ts
 * const response = await fetchWithRetry("https://api.example.com/data", {
 *   maxRetries: 3,
 *   timeoutMs: 30000,
 * });
 *
 * if (response.ok) {
 *   const data = await response.json();
 * }
 * ```
 */
export async function fetchWithRetry(
  url: string,
  config?: FetchConfig
): Promise<Response> {
  const merged = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= merged.maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        merged.timeoutMs
      );

      try {
        const response = await fetch(url, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Success: return response (even if status is not ok)
        if (!merged.retryStatusCodes.includes(response.status)) {
          return response;
        }

        // Status code requires retry, will be handled below
        if (attempt < merged.maxRetries) {
          const delay = calculateBackoffDelay(merged.initialDelayMs, attempt);
          await sleep(delay);
          continue;
        }

        // Max retries exhausted, return the error response
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If not a network error or network errors are disabled, throw immediately
      if (!(error instanceof TypeError) || !merged.retryOnNetworkError) {
        throw lastError;
      }

      // Network error and retries remaining: wait and retry
      if (attempt < merged.maxRetries) {
        const delay = calculateBackoffDelay(merged.initialDelayMs, attempt);
        await sleep(delay);
        continue;
      }

      // Max retries exhausted
      throw lastError;
    }
  }

  // Should not reach here, but throw last error if it does
  throw lastError || new Error("Unknown fetch error");
}

/**
 * Fetch with request/response initialization options and retry support.
 * Extends fetchWithRetry with init options.
 *
 * @param url - The URL to fetch
 * @param init - Standard Fetch API RequestInit options
 * @param config - Optional retry configuration
 * @returns Response object
 */
export async function fetchWithRetryInit(
  url: string,
  init?: RequestInit,
  config?: FetchConfig
): Promise<Response> {
  const merged = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= merged.maxRetries; attempt++) {
    try {
      // Create abort controller for timeout (merge with any existing signal)
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        merged.timeoutMs
      );

      try {
        const response = await fetch(url, {
          ...init,
          signal: init?.signal ?? controller.signal,
        });

        clearTimeout(timeoutId);

        // Success: return response
        if (!merged.retryStatusCodes.includes(response.status)) {
          return response;
        }

        // Status code requires retry
        if (attempt < merged.maxRetries) {
          const delay = calculateBackoffDelay(merged.initialDelayMs, attempt);
          await sleep(delay);
          continue;
        }

        // Max retries exhausted, return error response
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If not a network error or network errors are disabled, throw immediately
      if (!(error instanceof TypeError) || !merged.retryOnNetworkError) {
        throw lastError;
      }

      // Network error and retries remaining: wait and retry
      if (attempt < merged.maxRetries) {
        const delay = calculateBackoffDelay(merged.initialDelayMs, attempt);
        await sleep(delay);
        continue;
      }

      // Max retries exhausted
      throw lastError;
    }
  }

  // Should not reach here
  throw lastError || new Error("Unknown fetch error");
}

/**
 * Type-safe JSON fetching with retry support.
 * Automatically handles JSON parsing and provides type inference.
 *
 * @param url - The URL to fetch
 * @param init - Optional RequestInit
 * @param config - Optional retry configuration
 * @returns Parsed JSON data
 *
 * @example
 * ```ts
 * interface UserResponse {
 *   id: string;
 *   name: string;
 * }
 *
 * const user = await fetchJSON<UserResponse>(
 *   "https://api.example.com/user/123"
 * );
 * console.log(user.name); // Type-safe
 * ```
 */
export async function fetchJSON<T = unknown>(
  url: string,
  init?: RequestInit,
  config?: FetchConfig
): Promise<T> {
  const response = await fetchWithRetryInit(url, init, config);

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Create a custom fetch client with preset configuration.
 * Useful for API clients that always use the same retry settings.
 *
 * @param defaultConfig - Default configuration for all requests
 * @returns Fetch function with preset configuration
 *
 * @example
 * ```ts
 * const apiClient = createFetchClient({
 *   maxRetries: 2,
 *   timeoutMs: 15000,
 * });
 *
 * const response = await apiClient.fetch("https://api.example.com/data");
 * const data = await apiClient.json("https://api.example.com/data");
 * ```
 */
export function createFetchClient(defaultConfig?: FetchConfig) {
  return {
    /**
     * Fetch with client's default configuration.
     */
    fetch: async (
      url: string,
      init?: RequestInit,
      overrideConfig?: FetchConfig
    ) => {
      const merged = { ...defaultConfig, ...overrideConfig };
      return fetchWithRetryInit(url, init, merged);
    },

    /**
     * Fetch and parse JSON with client's default configuration.
     */
    json: async <T = unknown>(
      url: string,
      init?: RequestInit,
      overrideConfig?: FetchConfig
    ): Promise<T> => {
      const merged = { ...defaultConfig, ...overrideConfig };
      return fetchJSON<T>(url, init, merged);
    },
  };
}

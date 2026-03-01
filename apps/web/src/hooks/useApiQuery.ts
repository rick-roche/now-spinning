import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { getApiErrorMessage } from "../lib/errors";

interface UseApiQueryOptions {
  /** Whether the query should run automatically on mount */
  enabled?: boolean;
  /** Number of retry attempts on failure (default: 3) */
  retry?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryDelay?: number;
  /** Only retry on 5xx server errors, not 4xx client errors */
  retryOn5xxOnly?: boolean;
  /** Optional fallback message for non-OK responses */
  errorMessage?: string;
}

interface UseApiQueryResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching data from API endpoints with automatic retry logic.
 * 
 * @example
 * const { data, error, loading, refetch } = useApiQuery<Session>('/api/session/current');
 */
export function useApiQuery<T>(
  url: string,
  options: UseApiQueryOptions = {}
): UseApiQueryResult<T> {
  const {
    enabled = true,
    retry = 3,
    retryDelay = 1000,
    retryOn5xxOnly = true,
    errorMessage,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    let attempt = 0;
    while (attempt <= retry) {
      try {
        const response = await apiFetch(url, { signal: controller.signal });

        if (!response.ok) {
          const shouldRetry =
            attempt < retry &&
            (!retryOn5xxOnly || response.status >= 500);

          if (shouldRetry) {
            // Exponential backoff: 1s, 2s, 4s, ...
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            attempt++;
            continue;
          }

          const message = await getApiErrorMessage(
            response,
            errorMessage ?? `Request failed with status ${response.status}`
          );
          throw new Error(message);
        }

        const json: unknown = await response.json();
        if (mountedRef.current) {
          setData(json as T);
          setLoading(false);
        }
        return;
      } catch (err) {
        if (controller.signal.aborted) {
          return; // Request was cancelled
        }

        if (attempt === retry) {
          if (mountedRef.current) {
            const errorMessage =
              err instanceof Error ? err.message : "Request failed";
            setError(errorMessage);
            setLoading(false);
          }
          return;
        }

        // Retry on network or unknown errors
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
      }
    }
  }, [url, retry, retryDelay, retryOn5xxOnly, errorMessage]);

  useEffect(() => {
    if (enabled) {
      void fetchData();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, fetchData]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    data,
    error,
    loading,
    refetch: fetchData,
  };
}

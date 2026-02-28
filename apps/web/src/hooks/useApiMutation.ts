import { useCallback, useState } from "react";
import { apiFetch } from "../lib/api";

interface UseApiMutationOptions<TData> {
  /** Number of retry attempts on failure (default: 0 for mutations) */
  retry?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryDelay?: number;
  /** Only retry on 5xx server errors, not 4xx client errors */
  retryOn5xxOnly?: boolean;
  /** Callback on successful mutation */
  onSuccess?: (data: TData) => void;
  /** Callback on mutation error */
  onError?: (error: string) => void;
}

interface UseApiMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | null>;
  data: TData | null;
  error: string | null;
  loading: boolean;
  reset: () => void;
}

/**
 * Hook for API mutations (POST, PUT, DELETE) with retry logic and callbacks.
 * 
 * @example
 * const { mutate, loading, error } = useApiMutation<Session, { trackIndex: number }>(
 *   (vars) => ({
 *     url: `/api/session/${sessionId}/skip`,
 *     method: 'POST',
 *     body: JSON.stringify(vars),
 *   })
 * );
 * 
 * await mutate({ trackIndex: 1 });
 */
export function useApiMutation<TData = unknown, TVariables = void>(
  requestConfig: (variables: TVariables) => {
    url: string;
    method?: string;
    body?: string;
    headers?: HeadersInit;
  },
  options: UseApiMutationOptions<TData> = {}
): UseApiMutationResult<TData, TVariables> {
  const {
    retry = 0, // Default no retries for mutations
    retryDelay = 1000,
    retryOn5xxOnly = true,
    onSuccess,
    onError,
  } = options;

  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | null> => {
      setLoading(true);
      setError(null);
      setData(null);

      const { url, method = "POST", body, headers } = requestConfig(variables);

      let attempt = 0;
      while (attempt <= retry) {
        try {
          const response = await apiFetch(url, {
            method,
            ...(body ? { body } : {}),
            ...(headers ? { headers } : {}),
          });

          if (!response.ok) {
            const shouldRetry =
              attempt < retry &&
              (!retryOn5xxOnly || response.status >= 500);

            if (shouldRetry) {
              const delay = retryDelay * Math.pow(2, attempt);
              await new Promise((resolve) => setTimeout(resolve, delay));
              attempt++;
              continue;
            }

            let errorMessage = `Request failed with status ${response.status}`;
            try {
              const errorData: { error?: { message?: string } } =
                await response.json();
              errorMessage = errorData.error?.message ?? errorMessage;
            } catch {
              // Ignore JSON parse error
            }

            throw new Error(errorMessage);
          }

          const json: unknown = await response.json();
          const typedData = json as TData;

          setData(typedData);
          setLoading(false);

          if (onSuccess) {
            onSuccess(typedData);
          }

          return typedData;
        } catch (err) {
          if (attempt === retry) {
            const errorMessage =
              err instanceof Error ? err.message : "Request failed";
            setError(errorMessage);
            setLoading(false);

            if (onError) {
              onError(errorMessage);
            }

            return null;
          }

          // Retry on network or unknown errors
          const delay = retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt++;
        }
      }

      return null;
    },
    [requestConfig, retry, retryDelay, retryOn5xxOnly, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    mutate,
    data,
    error,
    loading,
    reset,
  };
}

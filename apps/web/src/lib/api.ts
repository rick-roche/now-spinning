/**
 * Fetch wrapper for API calls that includes credentials (cookies) by default.
 * Use this instead of raw `fetch()` for all `/api/*` requests.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    credentials: "include",
    ...init,
  });
}

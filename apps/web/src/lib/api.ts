/**
 * Construct the full API URL for a given endpoint path.
 * Uses environment variable or falls back to relative path for local dev.
 */
function getApiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  
  // In production, VITE_API_BASE_URL should be set to the Worker URL
  // In development, use relative paths (Vite proxy handles routing)
  if (baseUrl) {
    return `${baseUrl}${path}`;
  }
  
  // Fallback to relative path (dev environment with Vite proxy)
  return path;
}

/**
 * Fetch wrapper for API calls that includes credentials (cookies) by default.
 * Use this instead of raw `fetch()` for all `/api/*` requests.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(getApiUrl(path), {
    credentials: "include",
    ...init,
  });
}

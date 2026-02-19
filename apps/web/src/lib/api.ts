/**
 * Construct the full API URL for a given endpoint path.
 * Uses environment variable or falls back to relative path for local dev.
 */
export function getApiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  
  // In production, VITE_API_BASE_URL should be set to the Worker URL
  // In development, use relative paths (Vite proxy handles routing)
  if (baseUrl) {
    return `${baseUrl}${path}`;
  }
  
  // Fallback to relative path (dev environment with Vite proxy)
  return path;
}

/**
 * OAuth-related utilities for Cloudflare Workers.
 * These use the Web Crypto API available in Workers runtime.
 */

/**
 * Generate a random string suitable for PKCE or state tokens.
 */
export function generateRandomString(length: number = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt((randomValues[i] ?? 0) % chars.length);
  }
  return result;
}

/**
 * Parse form-encoded response (e.g., from OAuth endpoints).
 */
export function parseFormEncoded(data: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = data.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    }
  }
  return params;
}

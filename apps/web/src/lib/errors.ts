/**
 * Shared error message utilities for the web app.
 */

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
    ) {
      return payload.error.message;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

import md5Module from "js-md5";
import type { AppEnvironment } from "./types.js";

// js-md5 exports a function as the default export, handle both ESM and CJS
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
const rawMd5 = (md5Module as any).default || md5Module;

// Type guard and cast to ensure we have a function
const md5 = (input: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return String(rawMd5(input));
};

const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";
const LASTFM_REQUEST_TIMEOUT_MS = 15_000;

function createLastFmSignature(
  params: Record<string, string>,
  secret: string
): string {
  // Last.fm signature: sort all params (except api_sig and format), concatenate key+value pairs, append secret, MD5
  const sortedKeys = Object.keys(params)
    .filter(key => key !== "format" && key !== "api_sig") // Exclude format and api_sig from signature
    .sort();
  
  const signatureBase = sortedKeys
    .map((key) => `${key}${params[key] ?? ""}`)
    .join("")
    .concat(secret);

  const hash = md5(signatureBase);
  
  return hash;
}

export async function fetchLastFm<T>(
  method: string,
  params: Record<string, string>,
  env: Pick<AppEnvironment, "lastfmApiKey" | "lastfmApiSecret">
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const apiKey = env.lastfmApiKey?.trim();
  const sharedSecret = env.lastfmApiSecret?.trim();

  if (!apiKey || !sharedSecret) {
    return { ok: false, message: "Last.fm credentials not configured" };
  }

  const payload: Record<string, string> = {
    method,
    api_key: apiKey,
    format: "json",
    ...params,
  };

  const signature = createLastFmSignature(payload, sharedSecret);
  payload.api_sig = signature;

  const body = new URLSearchParams(payload).toString();
  
  let response: Response;
  try {
    response = await fetch(LASTFM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(LASTFM_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: "Last.fm request failed" };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return { ok: false, message: "Last.fm returned an invalid response" };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "Last.fm returned an invalid response" };
  }
  const data = raw as T & { error?: number; message?: string };
  
  if (!response.ok || data.error) {
    const errorMessage = data.message ?? "Last.fm request failed";
    console.error("[fetchLastFm] Error:", errorMessage);
    return { ok: false, message: errorMessage };
  }

  return { ok: true, data };
}

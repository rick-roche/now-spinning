import md5Module from "js-md5";
import type { CloudflareBinding } from "./types.js";

// js-md5 exports a function as the default export, handle both ESM and CJS
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
const rawMd5 = (md5Module as any).default || md5Module;

// Type guard and cast to ensure we have a function
const md5 = (input: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return String(rawMd5(input));
};

const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";

export function createLastFmSignature(
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
  
  console.log("[createLastFmSignature] Sorted keys (excl. format/api_sig):", sortedKeys);
  
  // Log each key-value pair for debugging
  sortedKeys.forEach(key => {
    const val = params[key] ?? "";
    const display = val.length > 40 ? val.substring(0, 40) + "..." : val;
    console.log(`[createLastFmSignature]   ${key}=${display}`);
  });
  
  // Log the signature base (truncated for security)
  const displayBase = signatureBase.length > 100 
    ? signatureBase.substring(0, 100) + "...[" + (signatureBase.length - 100) + " more chars]"
    : signatureBase;
  console.log("[createLastFmSignature] Signature base:", displayBase);
  console.log("[createLastFmSignature] Final hash:", hash);
  
  return hash;
}

export async function fetchLastFm<T>(
  method: string,
  params: Record<string, string>,
  env: CloudflareBinding
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const apiKey = env.LASTFM_API_KEY?.trim();
  const sharedSecret = env.LASTFM_API_SECRET?.trim();

  if (!apiKey || !sharedSecret) {
    return { ok: false, message: "Last.fm credentials not configured" };
  }

  const payload: Record<string, string> = {
    method,
    api_key: apiKey,
    format: "json",
    ...params,
  };

  console.log("[fetchLastFm] Payload before signature:", Object.keys(payload).sort());
  console.log("[fetchLastFm] sk value:", payload.sk ? payload.sk.substring(0, 10) + "..." : "MISSING");

  const signature = createLastFmSignature(payload, sharedSecret);
  payload.api_sig = signature;

  console.log("[fetchLastFm] Method:", method);
  console.log("[fetchLastFm] API key:", apiKey.substring(0, 4) + "...");
  console.log("[fetchLastFm] Payload keys:", Object.keys(payload).sort());
  console.log("[fetchLastFm] Signature (first 8):", signature.substring(0, 8));

  const body = new URLSearchParams(payload).toString();
  console.log("[fetchLastFm] POST body:", body);
  
  const response = await fetch(LASTFM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const raw: unknown = await response.json();
  const data = raw as T & { error?: number; message?: string };
  
  if (!response.ok || data.error) {
    const errorMessage = data.message ?? "Last.fm request failed";
    console.log("[fetchLastFm] Error response:", errorMessage, data);
    return { ok: false, message: errorMessage };
  }

  return { ok: true, data };
}

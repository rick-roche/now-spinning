import type { DirectScrobbleRequest } from "@repo/shared";

const STORAGE_KEY = "now-spinning:direct-scrobble-queue";
const CONTEXT_KEY = "now-spinning:direct-scrobble-context";

interface QueueEntry {
  context: string;
  request: DirectScrobbleRequest;
}

export function getDirectScrobbleQueueContext(): string {
  try {
    const existing = localStorage.getItem(CONTEXT_KEY);
    if (existing) return existing;
    const context = crypto.randomUUID();
    localStorage.setItem(CONTEXT_KEY, context);
    return context;
  } catch {
    return "unavailable";
  }
}

export function readDirectScrobbleQueue(): DirectScrobbleRequest[] {
  try {
    const context = getDirectScrobbleQueueContext();
    return readEntries().filter((item) => item.context === context).map((item) => item.request);
  } catch {
    return [];
  }
}

export function enqueueDirectScrobble(request: DirectScrobbleRequest): void {
  try {
    const context = getDirectScrobbleQueueContext();
    const queue = readEntries().filter((item) => item.request.operationId !== request.operationId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...queue, { context, request }]));
  } catch {
    // Restricted browser storage should not turn a network failure into a crash.
  }
}

export function removeDirectScrobble(operationId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readEntries().filter((item) => item.request.operationId !== operationId)));
  } catch {
    // Nothing to clean up when browser storage is unavailable.
  }
}

function readEntries(): QueueEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function isRequest(value: unknown): value is DirectScrobbleRequest {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DirectScrobbleRequest>;
  return typeof item.operationId === "string" && typeof item.releaseId === "string" && Array.isArray(item.trackIndices);
}

function isEntry(value: unknown): value is QueueEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<QueueEntry>;
  return typeof entry.context === "string" && isRequest(entry.request);
}

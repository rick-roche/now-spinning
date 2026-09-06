import { describe, expect, it, beforeEach, vi } from "vitest";
import { enqueueDirectScrobble, getDirectScrobbleQueueContext, readDirectScrobbleQueue, removeDirectScrobble } from "./direct-scrobble-queue";

describe("direct scrobble queue", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it("persists and removes queued requests", () => {
    const request = { operationId: "op-1", releaseId: "123", trackIndices: [0, 2] };
    enqueueDirectScrobble(request);
    expect(readDirectScrobbleQueue()).toEqual([request]);
    removeDirectScrobble(request.operationId);
    expect(readDirectScrobbleQueue()).toEqual([]);
  });

  it("does not expose entries created in another browser context", () => {
    const request = { operationId: "op-1", releaseId: "123", trackIndices: [0] };
    enqueueDirectScrobble(request);
    const contextKey = "now-spinning:direct-scrobble-context";
    localStorage.setItem(contextKey, "different-context");
    expect(readDirectScrobbleQueue()).toEqual([]);
    expect(getDirectScrobbleQueueContext()).toBe("different-context");
  });

  it("keeps other tagged entries readable when one is removed", () => {
    const first = { operationId: "op-1", releaseId: "123", trackIndices: [0] };
    const second = { operationId: "op-2", releaseId: "123", trackIndices: [1] };
    enqueueDirectScrobble(first);
    enqueueDirectScrobble(second);
    removeDirectScrobble(first.operationId);
    expect(readDirectScrobbleQueue()).toEqual([second]);
  });
});

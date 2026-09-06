import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppEnvironment } from "../types.js";
import { serializeDirectOperation } from "./scrobbles.js";

afterEach(() => { vi.restoreAllMocks(); });

function setup() {
  let tokenData = { lastfm: null as { service: "lastfm"; accessToken: string; storedAt: number; username?: string } | null, discogs: null };
  const storage = { loadTokens: (_userId: string) => tokenData, storeTokens: (_userId: string, tokens: typeof tokenData) => { tokenData = tokens; } };
  const environment = { port: 3000, databasePath: "/tmp/test.sqlite", publicAppOrigin: "http://localhost:3000", lastfmCallbackUrl: "http://localhost/callback", discogsCallbackUrl: "http://localhost/callback", allowedOrigins: [], devMode: true, staticRoot: "/nonexistent", NOW_SPINNING_STORAGE: storage, scheduler: undefined, lastfmApiKey: "key", lastfmApiSecret: "secret" } as unknown as AppEnvironment;
  return { storage, app: createApp(environment), environment };
}

describe("recent scrobble route", () => {
  it("serializes concurrent work for one direct operation", async () => {
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];
    const first = serializeDirectOperation("user:operation", async () => {
      order.push("first");
      releaseFirst();
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("first-finished");
    });
    await firstStarted;
    const second = serializeDirectOperation("user:operation", async () => { order.push("second"); });
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "first-finished", "second"]);
  });

  it("resolves a legacy Last.fm token username and returns normalized recent tracks", async () => {
    const { storage, app, environment } = setup();
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "session", storedAt: 1 }, discogs: null });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { name: "listener" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recenttracks: { track: [{ artist: { "#text": "Artist" }, name: "Track", album: { "#text": "Album" }, date: { uts: "1700000000" } }], "@attr": { page: "1", totalPages: "1", total: "1" } } }), { status: 200 }));

    const response = await app.fetch(new Request("http://localhost/api/scrobbles/recent?page=1&limit=50", { headers: { Cookie: "now_spinning_session=user-1" } }), environment);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ page: 1, limit: 50, items: [{ artist: "Artist", track: "Track" }] });
    expect(storage.loadTokens("user-1").lastfm).toMatchObject({ username: "listener" });
  });

  it("rejects an operation owned by another user without looking up or replacing it", async () => {
    const { storage, app, environment } = setup();
    storage.storeTokens("user-1", { lastfm: { service: "lastfm", accessToken: "session", storedAt: 1 }, discogs: null });
    const operationId = "00000000-0000-4000-8000-000000000001";
    const ownerLookup = vi.fn(() => "user-2");
    const save = vi.fn();
    Object.assign(storage, {
      loadDirectScrobbleOperationOwner: ownerLookup,
      loadDirectScrobbleOperation: vi.fn(),
      saveDirectScrobbleOperation: save,
      getCache: vi.fn(() => null),
    });

    const response = await app.fetch(new Request("http://localhost/api/scrobbles", {
      method: "POST",
      headers: { Cookie: "now_spinning_session=user-1", "Content-Type": "application/json" },
      body: JSON.stringify({ operationId, releaseId: "123", trackIndices: [0] }),
    }), environment);

    expect(response.status).toBe(409);
    expect(ownerLookup).toHaveBeenCalledWith(operationId);
    expect(save).not.toHaveBeenCalled();
  });
});

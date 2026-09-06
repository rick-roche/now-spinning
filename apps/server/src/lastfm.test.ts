import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLastFm, scrobbleDirectBatch } from "./lastfm.js";

afterEach(() => vi.restoreAllMocks());

const env = { lastfmApiKey: "api-key", lastfmApiSecret: "api-secret" };

describe("fetchLastFm", () => {
  it("normalizes transport failures into a controlled result", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(fetchLastFm("track.scrobble", { sk: "session-key" }, env)).resolves.toEqual({
      ok: false,
      message: "Last.fm request failed",
    });
  });

  it("normalizes malformed responses into a controlled result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json", { status: 200 }));

    await expect(fetchLastFm("track.scrobble", { sk: "session-key" }, env)).resolves.toEqual({
      ok: false,
      message: "Last.fm returned an invalid response",
    });
  });

  it("sets a finite request deadline", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await fetchLastFm("track.scrobble", { sk: "session-key" }, env);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});

describe("scrobbleDirectBatch", () => {
  it("sends up to the supplied batch and reports ignored tracks as terminal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      scrobbles: { scrobble: [
        { ignoredMessage: { code: 0 }, track: { "#text": "One" } },
        { ignoredMessage: { code: 1, message: "Track ignored" }, track: { "#text": "Two" } },
      ] },
    }), { status: 200 }));

    const result = await scrobbleDirectBatch(
      { lastfmApiKey: "api-key", lastfmApiSecret: "api-secret" },
      "session-key",
      [{ artist: "Artist", track: "One", album: "Album", timestamp: 10 }, { artist: "Artist", track: "Two", album: "Album", timestamp: 11 }],
    );

    expect(result).toEqual([
      { status: "delivered" },
      { status: "ignored", message: "Track ignored" },
    ]);
    const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
    const body = typeof rawBody === "string" ? rawBody : "";
    expect(body).toContain("track%5B0%5D=One");
    expect(body).toContain("track%5B1%5D=Two");
  });

  it("does not call Last.fm in dev mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await scrobbleDirectBatch(
      { lastfmApiKey: "api-key", lastfmApiSecret: "api-secret", devMode: true },
      "session-key",
      [{ artist: "Artist", track: "One", album: "Album", timestamp: 10 }],
    );

    expect(result).toEqual([{ status: "delivered" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

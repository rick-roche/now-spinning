import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLastFm } from "./lastfm.js";

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

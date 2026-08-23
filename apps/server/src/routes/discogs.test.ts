import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AppEnvironment } from "../types.js";
import type { SQLiteStorage } from "../storage/storage.js";

function createEnvironment(): AppEnvironment {
  const storage = {
    getCache: vi.fn(() => null),
    setCache: vi.fn(),
  } as unknown as SQLiteStorage;
  return {
    discogsConsumerKey: "test-key",
    discogsConsumerSecret: "test-secret",
    allowedOrigins: [],
    publicAppOrigin: "http://localhost:3000",
    staticRoot: "/nonexistent",
    NOW_SPINNING_STORAGE: storage,
  } as unknown as AppEnvironment;
}

describe("Discogs routes", () => {
  it("validates master IDs before calling Discogs", async () => {
    const environment = createEnvironment();
    const response = await createApp(environment).fetch(
      new Request("http://localhost/api/discogs/master/not-a-number/versions"),
      environment
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("maps a missing master to a not-found response", async () => {
    const environment = createEnvironment();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 404 }));

    const response = await createApp(environment).fetch(
      new Request("http://localhost/api/discogs/master/123/versions"),
      environment
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    fetchMock.mockRestore();
  });
});

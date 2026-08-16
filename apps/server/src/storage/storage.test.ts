import { afterEach, describe, expect, it } from "vitest";
import { unlinkSync } from "node:fs";
import { openDatabase } from "./database.js";
import { SQLiteStorage } from "./storage.js";

const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) { try { unlinkSync(path); } catch { /* test cleanup */ } } });

function createStorage(): SQLiteStorage {
  const path = `/tmp/now-spinning-test-${crypto.randomUUID()}.sqlite`;
  paths.push(path);
  return new SQLiteStorage(openDatabase(path));
}

describe("SQLiteStorage", () => {
  it("persists tokens and consumes OAuth state once", () => {
    const storage = createStorage();
    storage.storeTokens("user", { lastfm: { service: "lastfm", accessToken: "key", storedAt: 1 }, discogs: null });
    expect(storage.loadTokens("user").lastfm?.accessToken).toBe("key");
    storage.storeOAuthState("lastfm", "state", { sessionId: "user" });
    expect(storage.consumeOAuthState("lastfm", "state")).toEqual({ sessionId: "user" });
    expect(storage.consumeOAuthState("lastfm", "state")).toBeNull();
    storage.close();
  });

  it("expires cache entries", () => {
    const storage = createStorage();
    storage.setCache("key", { value: true }, 0);
    expect(storage.getCache("key")).toBeNull();
    storage.close();
  });
});

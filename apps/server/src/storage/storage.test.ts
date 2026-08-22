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

  it("allows only one live scheduler lease owner", () => {
    const storage = createStorage();
    expect(storage.acquireSchedulerLease("first", 1_000, 100)).toBe(true);
    expect(storage.acquireSchedulerLease("second", 1_050, 100)).toBe(false);
    expect(storage.ownsSchedulerLease("first", 1_050)).toBe(true);
    expect(storage.acquireSchedulerLease("second", 1_101, 100)).toBe(true);
    expect(storage.ownsSchedulerLease("first", 1_101)).toBe(false);
    expect(storage.ownsSchedulerLease("second", 1_101)).toBe(true);
    storage.close();
  });

  it("renews and releases only the current scheduler lease", () => {
    const storage = createStorage();
    expect(storage.acquireSchedulerLease("owner", 1_000, 100)).toBe(true);
    expect(storage.renewSchedulerLease("owner", 1_050, 100)).toBe(true);
    expect(storage.ownsSchedulerLease("owner", 1_149)).toBe(true);
    storage.releaseSchedulerLease("other");
    expect(storage.ownsSchedulerLease("owner", 1_149)).toBe(true);
    storage.releaseSchedulerLease("owner");
    expect(storage.ownsSchedulerLease("owner", 1_149)).toBe(false);
    storage.close();
  });
});

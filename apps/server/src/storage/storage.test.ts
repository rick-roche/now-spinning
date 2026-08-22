import { afterEach, describe, expect, it } from "vitest";
import { unlinkSync } from "node:fs";
import { openDatabase } from "./database.js";
import { SQLiteStorage } from "./storage.js";
import { StorageCryptoError } from "./crypto.js";

const paths: string[] = [];
const encryptionKey = Buffer.alloc(32, 7);
afterEach(() => { for (const path of paths.splice(0)) { try { unlinkSync(path); } catch { /* test cleanup */ } } });

function createStorage(): SQLiteStorage {
  const path = `/tmp/now-spinning-test-${crypto.randomUUID()}.sqlite`;
  paths.push(path);
  return new SQLiteStorage(openDatabase(path), encryptionKey);
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

  it("fails closed when stored token JSON is corrupt", () => {
    const path = `/tmp/now-spinning-test-${crypto.randomUUID()}.sqlite`;
    paths.push(path);
    const database = openDatabase(path);
    const storage = new SQLiteStorage(database, encryptionKey);
    storage.storeTokens("user", { lastfm: null, discogs: null });
    database.prepare("UPDATE tokens SET json = ? WHERE user_id = ?").run("not-json", "user");
    expect(() => storage.loadTokens("user")).toThrow(StorageCryptoError);
    storage.close();
  });

  it("migrates legacy plaintext tokens to encrypted storage", () => {
    const path = `/tmp/now-spinning-test-${crypto.randomUUID()}.sqlite`;
    paths.push(path);
    const database = openDatabase(path);
    const storage = new SQLiteStorage(database, encryptionKey);
    database.prepare("INSERT INTO tokens(user_id,json,updated_at) VALUES(?,?,?)")
      .run("legacy", JSON.stringify({ lastfm: { service: "lastfm", accessToken: "secret", storedAt: 1 }, discogs: null }), Date.now());
    expect(storage.loadTokens("legacy").lastfm?.accessToken).toBe("secret");
    expect((database.prepare("SELECT json FROM tokens WHERE user_id = ?").get("legacy") as { json: string }).json).toMatch(/^v1:/);
    storage.close();
  });

  it("evicts corrupt cache and session rows", () => {
    const path = `/tmp/now-spinning-test-${crypto.randomUUID()}.sqlite`;
    paths.push(path);
    const database = openDatabase(path);
    const storage = new SQLiteStorage(database, encryptionKey);
    database.prepare("INSERT INTO cache_entries(key,json,expires_at) VALUES(?,?,?)").run("bad", "not-json", Date.now() + 60_000);
    database.prepare("INSERT INTO sessions(id,user_id,session_json,updated_at) VALUES(?,?,?,?)").run("bad", "user", "not-json", Date.now());
    expect(storage.getCache("bad")).toBeNull();
    expect(storage.loadSession("bad")).toBeNull();
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

import { afterEach, describe, expect, it } from "vitest";
import { unlinkSync } from "node:fs";
import { openDatabase } from "./database.js";
import { SQLiteStorage } from "./storage.js";
import { StorageCryptoError } from "./crypto.js";
import type { DirectScrobbleOperation } from "@repo/shared";

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

  it("claims each scrobble identity only once and releases failed claims", () => {
    const storage = createStorage();

    expect(storage.claimScrobble("scrobble-1", "user", 1_000)).toBe("claimed");
    expect(storage.claimScrobble("scrobble-1", "user", 1_000)).toBe("in_flight");
    storage.releaseScrobble("scrobble-1");
    expect(storage.claimScrobble("scrobble-1", "user", 1_000)).toBe("claimed");
    storage.completeScrobble("scrobble-1", 2_000);
    expect(storage.claimScrobble("scrobble-1", "user", 1_000)).toBe("delivered");
    storage.close();
  });

  it("expires delivery records after the deduplication window", () => {
    const storage = createStorage();

    expect(storage.claimScrobble("scrobble-1", "user", 1_000)).toBe("claimed");
    storage.completeScrobble("scrobble-1", 2_000);
    expect(storage.claimScrobble("scrobble-1", "user", 86_401_000)).toBe("claimed");
    storage.close();
  });

  it("persists direct scrobble operations and their progress", () => {
    const storage = createStorage();
    const operation: DirectScrobbleOperation = {
      operationId: "operation-1",
      releaseId: "123",
      trackIndices: [0],
      createdAt: 1_000,
      updatedAt: 1_000,
      status: "pending",
      activeSessionWarning: false,
      tracks: [],
    };

    storage.saveDirectScrobbleOperation("user", operation, 1_000);
    expect(storage.loadDirectScrobbleOperation("user", "operation-1", 1_001)?.operation).toEqual(operation);
    storage.close();
  });

  it("does not let another user replace an operation", () => {
    const storage = createStorage();
    const operation: DirectScrobbleOperation = {
      operationId: "operation-owner",
      releaseId: "123",
      trackIndices: [0],
      createdAt: 1_000,
      updatedAt: 1_000,
      status: "pending",
      activeSessionWarning: false,
      tracks: [],
    };

    storage.saveDirectScrobbleOperation("owner", operation, 1_000, "owner-fingerprint");
    expect(storage.loadDirectScrobbleOperationOwner("operation-owner")).toBe("owner");
    storage.saveDirectScrobbleOperation("other", { ...operation, releaseId: "456" }, 2_000, "other-fingerprint");
    expect(storage.loadDirectScrobbleOperation("owner", "operation-owner")?.fingerprint).toBe("owner-fingerprint");
    expect(storage.loadDirectScrobbleOperationOwner("operation-owner")).toBe("owner");
    storage.close();
  });

  it("retains a compact tombstone after operation records expire", () => {
    const storage = createStorage();
    const operation: DirectScrobbleOperation = {
      operationId: "operation-1",
      releaseId: "123",
      trackIndices: [0],
      createdAt: 1_000,
      updatedAt: 1_000,
      status: "completed",
      activeSessionWarning: false,
      tracks: [],
    };
    storage.saveDirectScrobbleOperation("user", operation, 1_000);
    expect(storage.loadDirectScrobbleOperation("user", "operation-1", 1_000 + 7 * 86_400_000 + 1)?.tombstone).toBe(true);
    storage.close();
  });

  it("expires direct operations without requiring a SQL status column", () => {
    const storage = createStorage();
    const operation: DirectScrobbleOperation = {
      operationId: "operation-expiry",
      releaseId: "123",
      trackIndices: [0],
      createdAt: 1_000,
      updatedAt: 1_000,
      status: "failed",
      activeSessionWarning: false,
      tracks: [],
    };

    storage.saveDirectScrobbleOperation("user", operation, 1_000);
    expect(storage.loadDirectScrobbleOperation("user", "operation-expiry", 1_000 + 7 * 86_400_000 + 1)?.tombstone).toBe(true);
    storage.close();
  });
});

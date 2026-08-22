import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, StorageCryptoError } from "./crypto.js";

const key = Buffer.alloc(32, 7);

describe("storage crypto", () => {
  it("round trips encrypted JSON with authenticated context", () => {
    const encrypted = encryptJson({ token: "secret" }, key, "tokens:user");
    expect(encrypted).not.toContain("secret");
    expect(decryptJson<{ token: string }>(encrypted, key, "tokens:user")).toEqual({ token: "secret" });
  });

  it("uses a fresh nonce and rejects tampering or wrong context", () => {
    const first = encryptJson({ token: "same" }, key, "tokens:user");
    const second = encryptJson({ token: "same" }, key, "tokens:user");
    expect(first).not.toBe(second);
    expect(() => decryptJson(first, Buffer.alloc(32, 8), "tokens:user")).toThrow(StorageCryptoError);
    expect(() => decryptJson(first, key, "tokens:other")).toThrow(StorageCryptoError);
  });

  it("rejects unsupported envelopes", () => {
    expect(() => decryptJson("v2:payload", key, "tokens:user")).toThrow(StorageCryptoError);
  });
});

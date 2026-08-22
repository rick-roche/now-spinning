import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class StorageCryptoError extends Error {
  constructor(message = "Encrypted storage could not be read") {
    super(message);
    this.name = "StorageCryptoError";
  }
}

export function encryptJson(value: unknown, key: Buffer, associatedData: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  return `${VERSION}:${payload}`;
}

export function decryptJson<T>(encoded: string, key: Buffer, associatedData: string): T {
  if (!encoded.startsWith(`${VERSION}:`)) throw new StorageCryptoError("Unsupported encrypted storage version");
  let payload: Buffer;
  try {
    payload = Buffer.from(encoded.slice(VERSION.length + 1), "base64url");
  } catch {
    throw new StorageCryptoError();
  }
  if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) throw new StorageCryptoError();

  try {
    const decipher = createDecipheriv(ALGORITHM, key, payload.subarray(0, IV_LENGTH));
    decipher.setAuthTag(payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH));
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    const plaintext = Buffer.concat([
      decipher.update(payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as T;
  } catch {
    throw new StorageCryptoError();
  }
}

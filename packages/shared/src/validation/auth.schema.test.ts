import { describe, expect, it } from "vitest";
import {
  LastFmCallbackQuerySchema,
  DiscogsCallbackQuerySchema,
  OAuthCallbackQuerySchema,
} from "./auth.schema.js";

describe("LastFmCallbackQuerySchema", () => {
  it("accepts valid token", () => {
    const result = LastFmCallbackQuerySchema.safeParse({ token: "abc123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toBe("abc123");
    }
  });

  it("accepts error field", () => {
    const result = LastFmCallbackQuerySchema.safeParse({ error: "Unauthorized" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("Unauthorized");
    }
  });

  it("accepts empty object (both optional)", () => {
    const result = LastFmCallbackQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-string token", () => {
    const result = LastFmCallbackQuerySchema.safeParse({ token: 123 });
    expect(result.success).toBe(false);
  });
});

describe("DiscogsCallbackQuerySchema", () => {
  it("accepts valid oauth_token and oauth_verifier", () => {
    const result = DiscogsCallbackQuerySchema.safeParse({
      oauth_token: "tok",
      oauth_verifier: "ver",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.oauth_token).toBe("tok");
      expect(result.data.oauth_verifier).toBe("ver");
    }
  });

  it("accepts error fields", () => {
    const result = DiscogsCallbackQuerySchema.safeParse({
      error: "access_denied",
      error_description: "User denied",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    const result = DiscogsCallbackQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-string oauth_token", () => {
    const result = DiscogsCallbackQuerySchema.safeParse({ oauth_token: 42 });
    expect(result.success).toBe(false);
  });
});

describe("OAuthCallbackQuerySchema", () => {
  it("accepts code and state", () => {
    const result = OAuthCallbackQuerySchema.safeParse({
      code: "authcode",
      state: "random-state",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("authcode");
      expect(result.data.state).toBe("random-state");
    }
  });

  it("accepts error with description", () => {
    const result = OAuthCallbackQuerySchema.safeParse({
      error: "invalid_request",
      error_description: "Missing required parameter",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = OAuthCallbackQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  SessionStartRequestSchema,
  SessionIdSchema,
  SessionParamSchema,
} from "./session.schema.js";

describe("SessionStartRequestSchema", () => {
  it("accepts valid releaseId", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "12345" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.releaseId).toBe("12345");
    }
  });

  it("trims whitespace from releaseId", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "  12345  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.releaseId).toBe("12345");
    }
  });

  it("rejects empty releaseId", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only releaseId", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects missing releaseId", () => {
    const result = SessionStartRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string releaseId", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: 123 });
    expect(result.success).toBe(false);
  });
});

describe("SessionIdSchema", () => {
  it("accepts valid session ID", () => {
    const result = SessionIdSchema.safeParse("sess-abc-123");
    expect(result.success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = SessionIdSchema.safeParse("  sess-123  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("sess-123");
    }
  });

  it("rejects empty string", () => {
    const result = SessionIdSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    const result = SessionIdSchema.safeParse("   ");
    expect(result.success).toBe(false);
  });
});

describe("SessionParamSchema", () => {
  it("accepts valid param object", () => {
    const result = SessionParamSchema.safeParse({ id: "sess-123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("sess-123");
    }
  });

  it("rejects missing id", () => {
    const result = SessionParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = SessionParamSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });
});

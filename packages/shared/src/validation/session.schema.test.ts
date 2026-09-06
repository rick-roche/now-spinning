import { describe, expect, it } from "vitest";
import {
  SessionStartRequestSchema,
  SessionSyncRequestSchema,
  SessionIdSchema,
  SessionParamSchema,
  SessionMutationRequestSchema,
  SessionEndRequestSchema,
  SessionScrobbleNowRequestSchema,
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

  it("defaults thresholdPercent to 50", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thresholdPercent).toBe(50);
    }
  });

  it("accepts explicit thresholdPercent", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "123", thresholdPercent: 80 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thresholdPercent).toBe(80);
    }
  });

  it("rejects a zero threshold percent", () => {
    expect(SessionStartRequestSchema.safeParse({ releaseId: "123", thresholdPercent: 0 }).success).toBe(false);
  });

  it("defaults notifyOnSideCompletion to true", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyOnSideCompletion).toBe(true);
    }
  });

  it("accepts explicit notifyOnSideCompletion false", () => {
    const result = SessionStartRequestSchema.safeParse({ releaseId: "123", notifyOnSideCompletion: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyOnSideCompletion).toBe(false);
    }
  });
});

describe("SessionSyncRequestSchema", () => {
  it("accepts an empty object", () => {
    const result = SessionSyncRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects client policy overrides", () => {
    expect(SessionSyncRequestSchema.safeParse({ thresholdPercent: 75 }).success).toBe(false);
    expect(SessionSyncRequestSchema.safeParse({ notifyOnSideCompletion: false }).success).toBe(false);
    expect(SessionSyncRequestSchema.safeParse({ thresholdPercent: -1 }).success).toBe(false);
  });
});

describe("SessionMutationRequestSchema", () => {
  it("requires a mutation ID and the session revision it was created for", () => {
    expect(SessionMutationRequestSchema.safeParse({
      mutationId: "8a812d1b-7118-4a72-9680-852d68cbf2f2",
      expectedRevision: 4,
      expectedTrackIndex: 1,
    }).success).toBe(true);
    expect(SessionMutationRequestSchema.safeParse({
      expectedRevision: 4,
      expectedTrackIndex: 1,
    }).success).toBe(false);
    expect(SessionMutationRequestSchema.safeParse({
      mutationId: "8a812d1b-7118-4a72-9680-852d68cbf2f2",
      expectedRevision: -1,
      expectedTrackIndex: 1,
    }).success).toBe(false);
  });
});

describe("SessionEndRequestSchema", () => {
  it("requires an explicit end mode", () => {
    const base = { mutationId: "8a812d1b-7118-4a72-9680-852d68cbf2f2", expectedRevision: 0, expectedTrackIndex: 0 };
    expect(SessionEndRequestSchema.safeParse(base).success).toBe(false);
    expect(SessionEndRequestSchema.safeParse({ ...base, endMode: "end-without-scrobbling" }).success).toBe(true);
    expect(SessionEndRequestSchema.safeParse({ ...base, endMode: "unknown" }).success).toBe(false);
  });
});

describe("SessionScrobbleNowRequestSchema", () => {
  it("accepts the session mutation preconditions", () => {
    expect(SessionScrobbleNowRequestSchema.safeParse({
      mutationId: "8a812d1b-7118-4a72-9680-852d68cbf2f2",
      expectedRevision: 2,
      expectedTrackIndex: 1,
    }).success).toBe(true);
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

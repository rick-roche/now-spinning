import { describe, expect, it } from "vitest";
import {
  DiscogsCollectionQuerySchema,
  DiscogsSearchQuerySchema,
  DiscogsReleaseIdSchema,
  DiscogsReleaseParamSchema,
} from "./discogs.schema.js";

describe("DiscogsCollectionQuerySchema", () => {
  it("applies defaults when fields are omitted", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(25);
      expect(result.data.query).toBe("");
      expect(result.data.sortBy).toBe("dateAdded");
      expect(result.data.sortDir).toBe("desc");
    }
  });

  it("coerces string page to number", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ page: "3" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
    }
  });

  it("rejects non-positive page", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects perPage below minimum", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ perPage: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects perPage above maximum", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ perPage: 200 });
    expect(result.success).toBe(false);
  });

  it("accepts valid perPage", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ perPage: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.perPage).toBe(50);
    }
  });

  it("trims collection query", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ query: "  Beatles  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("Beatles");
    }
  });

  it("rejects invalid sortBy value", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ sortBy: "genre" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sortDir value", () => {
    const result = DiscogsCollectionQuerySchema.safeParse({ sortDir: "sideways" });
    expect(result.success).toBe(false);
  });
});

describe("DiscogsSearchQuerySchema", () => {
  it("requires a non-empty query", () => {
    const result = DiscogsSearchQuerySchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from query", () => {
    const result = DiscogsSearchQuerySchema.safeParse({ query: "  Pink Floyd  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("Pink Floyd");
    }
  });

  it("rejects missing query", () => {
    const result = DiscogsSearchQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts query with pagination", () => {
    const result = DiscogsSearchQuerySchema.safeParse({ query: "test", page: 2, perPage: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.perPage).toBe(10);
    }
  });

  it("rejects whitespace-only query", () => {
    const result = DiscogsSearchQuerySchema.safeParse({ query: "   " });
    expect(result.success).toBe(false);
  });
});

describe("DiscogsReleaseIdSchema", () => {
  it("accepts valid release ID", () => {
    const result = DiscogsReleaseIdSchema.safeParse("12345");
    expect(result.success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = DiscogsReleaseIdSchema.safeParse("  12345  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("12345");
    }
  });

  it("rejects empty string", () => {
    const result = DiscogsReleaseIdSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    const result = DiscogsReleaseIdSchema.safeParse("   ");
    expect(result.success).toBe(false);
  });
});

describe("DiscogsReleaseParamSchema", () => {
  it("accepts valid param object", () => {
    const result = DiscogsReleaseParamSchema.safeParse({ id: "12345" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("12345");
    }
  });

  it("rejects missing id", () => {
    const result = DiscogsReleaseParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

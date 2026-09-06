import { describe, expect, it } from "vitest";
import { RecentScrobblesQuerySchema } from "../validation/recent-scrobbles.schema.js";

describe("recent scrobbles contracts", () => {
  it("defaults to 50 items and caps requests at 200", () => {
    expect(RecentScrobblesQuerySchema.parse({})).toEqual({ page: 1, limit: 50 });
    expect(RecentScrobblesQuerySchema.parse({ page: "2", limit: "200" })).toEqual({ page: 2, limit: 200 });
    expect(RecentScrobblesQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });
});

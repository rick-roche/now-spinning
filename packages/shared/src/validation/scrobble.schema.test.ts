import { describe, expect, it } from "vitest";
import { DirectScrobbleRequestSchema } from "./scrobble.schema.js";

describe("DirectScrobbleRequestSchema", () => {
  it("rejects duplicate track indices", () => {
    expect(DirectScrobbleRequestSchema.safeParse({
      operationId: "00000000-0000-4000-8000-000000000001",
      releaseId: "123",
      trackIndices: [0, 0],
    }).success).toBe(false);
  });

  it("accepts an ordered selected-track request", () => {
    expect(DirectScrobbleRequestSchema.parse({
      operationId: "00000000-0000-4000-8000-000000000001",
      releaseId: "123",
      trackIndices: [2, 0],
    }).trackIndices).toEqual([2, 0]);
  });
});

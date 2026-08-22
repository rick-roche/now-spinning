import { describe, expect, it } from "vitest";
import { createAPIError } from "./errors.js";

describe("createAPIError", () => {
  it("returns a valid error when WebCrypto is available", () => {
    const result = createAPIError("TEST", "Test error");
    expect(result.error.code).toBe("TEST");
    expect(result.error.message).toBe("Test error");
    expect(result.error.requestId).toEqual(expect.any(String));
  });
});

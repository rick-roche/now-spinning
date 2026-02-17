import { describe, expect, it } from "vitest";
import { createLastFmSignature } from "./lastfm.js";

describe("createLastFmSignature", () => {
  it("creates an MD5 signature from sorted params", () => {
    const signature = createLastFmSignature({ b: "2", a: "1" }, "secret");
    expect(signature).toBe("670699129dd49818b5abd9e7c2fd6569");
  });

  it("excludes format and api_sig from signature", () => {
    const signature = createLastFmSignature(
      {
        method: "auth.getSession",
        api_key: "xxxxxxxxxx",
        token: "yyyyyy",
        format: "json",
        api_sig: "should-be-ignored",
      },
      "ilovecher"
    );
    // Signature should be: md5("api_keyxxxxxxxxxxmethodauth.getSessiontokenyyyyyyilovecher")
    expect(signature).toBe("b87d61da3cda91a8b6746c4aef55d6f8");
  });

  it("handles track.updateNowPlaying signature correctly", () => {
    // Test case based on actual data from logs
    const signature = createLastFmSignature(
      {
        album: "Selected Ambient Works 85-92",
        api_key: "f04f310165be2e8bb53c0d46e03e4a96",
        artist: "Aphex Twin",
        duration: "291",
        method: "track.updateNowPlaying",
        sk: "Ot7_wk5-b6yvYvd3_CdNGPbX1Ix6-JWX",
        track: "Xtal",
        format: "json",
      },
      "test-secret"
    );
    // This should produce a valid signature when using the correct secret
    // The signature string should be:
    // "albumSelected Ambient Works 85-92api_keyf04f310165be2e8bb53c0d46e03e4a96artistAphex Twinduration291methodtrack.updateNowPlayingskOt7_wk5-b6yvYvd3_CdNGPbX1Ix6-JWXtrackXtaltest-secret"
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  it("handles track.scrobble signature correctly with timestamp", () => {
    const signature = createLastFmSignature(
      {
        album: "Selected Ambient Works 85-92",
        api_key: "f04f310165be2e8bb53c0d46e03e4a96",
        artist: "Aphex Twin",
        duration: "291",
        method: "track.scrobble",
        sk: "Ot7_wk5-b6yvYvd3_CdNGPbX1Ix6-JWX",
        timestamp: "1771227791",
        track: "Xtal",
        format: "json",
      },
      "test-secret"
    );
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  // Edge case tests
  it("handles empty params object", () => {
    const signature = createLastFmSignature({}, "secret");
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32); // MD5 hex always 32 chars
    // Verify it's deterministic
    const sig2 = createLastFmSignature({}, "secret");
    expect(signature).toBe(sig2);
  });

  it("handles single parameter", () => {
    const signature = createLastFmSignature({ key: "value" }, "secret");
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  it("handles parameters with spaces", () => {
    const signature = createLastFmSignature(
      { artist: "The Beatles", album: "Abbey Road" },
      "secret"
    );
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  it("handles special characters in values", () => {
    const signature = createLastFmSignature(
      { track: "Song & Dance", artist: "Artist/Solo" },
      "secret"
    );
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  it("sorts keys case-sensitively", () => {
    const sig1 = createLastFmSignature({ B: "2", a: "1" }, "secret");
    const sig2 = createLastFmSignature({ b: "2", A: "1" }, "secret");
    // Different key cases should produce different signatures
    expect(sig1).not.toBe(sig2);
  });

  it("handles numeric string values", () => {
    const signature = createLastFmSignature(
      { duration: "3", trackNumber: "5", year: "2024" },
      "secret"
    );
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  it("handles long parameter values", () => {
    const longValue = "a".repeat(1000);
    const signature = createLastFmSignature({ text: longValue }, "secret");
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  it("excludes format even when explicitly included", () => {
    const sig1 = createLastFmSignature(
      { key: "value", format: "json" },
      "secret"
    );
    const sig2 = createLastFmSignature({ key: "value" }, "secret");
    expect(sig1).toBe(sig2);
  });

  it("excludes api_sig even when explicitly included", () => {
    const sig1 = createLastFmSignature(
      { key: "value", api_sig: "xyz" },
      "secret"
    );
    const sig2 = createLastFmSignature({ key: "value" }, "secret");
    expect(sig1).toBe(sig2);
  });

  it("handles both format and api_sig exclusion", () => {
    const sig1 = createLastFmSignature(
      { key: "value", format: "json", api_sig: "xyz" },
      "secret"
    );
    const sig2 = createLastFmSignature({ key: "value" }, "secret");
    expect(sig1).toBe(sig2);
  });

  it("handles empty string values", () => {
    const signature = createLastFmSignature(
      { key1: "", key2: "value", key3: "" },
      "secret"
    );
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });

  it("is deterministic - same input produces same output", () => {
    const params = { z: "1", a: "2", m: "3" };
    const sig1 = createLastFmSignature(params, "secret");
    const sig2 = createLastFmSignature(params, "secret");
    expect(sig1).toBe(sig2);
  });

  it("changes with different secret", () => {
    const params = { key: "value" };
    const sig1 = createLastFmSignature(params, "secret1");
    const sig2 = createLastFmSignature(params, "secret2");
    expect(sig1).not.toBe(sig2);
  });

  it("changes with different param values", () => {
    const sig1 = createLastFmSignature({ key: "value1" }, "secret");
    const sig2 = createLastFmSignature({ key: "value2" }, "secret");
    expect(sig1).not.toBe(sig2);
  });

  it("handles many parameters", () => {
    const params: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      params[`key${i}`] = `value${i}`;
    }
    const signature = createLastFmSignature(params, "secret");
    expect(signature).toBeDefined();
    expect(signature).toHaveLength(32);
  });
});

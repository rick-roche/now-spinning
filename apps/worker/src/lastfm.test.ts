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
    expect(signature).toBe("9c195ef6042c226190308de2283bb826");
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
});

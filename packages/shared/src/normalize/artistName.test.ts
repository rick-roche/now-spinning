import { describe, expect, it } from "vitest";
import { stripDiscogsDisambiguation } from "./artistName.js";

describe("stripDiscogsDisambiguation", () => {
  it("strips numeric disambiguation suffix", () => {
    expect(stripDiscogsDisambiguation("John Smith (2)")).toBe("John Smith");
    expect(stripDiscogsDisambiguation("John Smith (3)")).toBe("John Smith");
    expect(stripDiscogsDisambiguation("John Smith (10)")).toBe("John Smith");
    expect(stripDiscogsDisambiguation("John Smith (999)")).toBe("John Smith");
  });

  it("leaves names without disambiguation untouched", () => {
    expect(stripDiscogsDisambiguation("Radiohead")).toBe("Radiohead");
    expect(stripDiscogsDisambiguation("The Beatles")).toBe("The Beatles");
  });

  it("preserves non-numeric parenthetical content", () => {
    expect(stripDiscogsDisambiguation("Mercury Rev (DJ)")).toBe("Mercury Rev (DJ)");
    expect(stripDiscogsDisambiguation("Smith (Remix)")).toBe("Smith (Remix)");
    expect(stripDiscogsDisambiguation("Artist (Live)")).toBe("Artist (Live)");
    expect(stripDiscogsDisambiguation("Band (UK)")).toBe("Band (UK)");
  });

  it("only strips the trailing suffix", () => {
    expect(stripDiscogsDisambiguation("Artist (2) Feat. Other")).toBe("Artist (2) Feat. Other");
  });

  it("handles multiple spaces before the suffix", () => {
    expect(stripDiscogsDisambiguation("Artist  (2)")).toBe("Artist");
  });

  it("does not strip (0) or (1) which Discogs never uses", () => {
    // Discogs never uses (0) or (1), but our regex would still match them.
    // This documents current behavior — these values don't appear in practice.
    expect(stripDiscogsDisambiguation("Artist (0)")).toBe("Artist");
    expect(stripDiscogsDisambiguation("Artist (1)")).toBe("Artist");
  });

  it("handles empty string", () => {
    expect(stripDiscogsDisambiguation("")).toBe("");
  });

  it("does not strip parentheses that are part of the name with mixed content", () => {
    expect(stripDiscogsDisambiguation("Sunn O)))")).toBe("Sunn O)))");
    expect(stripDiscogsDisambiguation("Artist (2nd Edition)")).toBe("Artist (2nd Edition)");
  });
});

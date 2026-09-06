import { describe, expect, it } from "vitest";
import { normalizeRecentTracks } from "./lastfm.js";

describe("Last.fm recent tracks", () => {
  it("normalizes tracks, artwork, timestamps, and excludes now-playing rows", () => {
    expect(normalizeRecentTracks([
      { artist: { "#text": "Artist" }, name: "Track", album: { "#text": "Album" }, date: { uts: "1700000000" }, image: [{ "#text": "cover" }] },
      { artist: { "#text": "Live Artist" }, name: "Now", album: { "#text": "Live" }, "@attr": { nowplaying: "true" } },
    ])).toEqual([{
      artist: "Artist", track: "Track", album: "Album", artworkUrl: "cover", timestamp: 1700000000,
    }]);
  });
});

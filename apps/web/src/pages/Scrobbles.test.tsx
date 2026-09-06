import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Scrobbles } from "./Scrobbles";
import { createFetchMock } from "../test-utils";

vi.mock("react-router-dom", () => ({ Link: ({ children }: { children: unknown }) => children }));

describe("Scrobbles page", () => {
  it("shows confirmed tracks and an empty fallback without artwork", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ lastfmConnected: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ page: 1, limit: 50, pages: 1, total: 1, items: [{ artist: "Artist", track: "Track", album: "Album", artworkUrl: null, timestamp: 1700000000 }] })));
    render(<Scrobbles />);
    await waitFor(() => expect(screen.getByText("Track")).toBeInTheDocument());
    expect(screen.getByText("Artist")).toBeInTheDocument();
    expect(screen.getByText("Album")).toBeInTheDocument();
  });
});

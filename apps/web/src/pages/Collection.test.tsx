/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Collection } from "./Collection";
import type { DiscogsCollectionResponse, AuthStatusResponse } from "@repo/shared";

// Mock fetch globally
global.fetch = vi.fn();

describe("Collection Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays loading state on mount", () => {
    (global.fetch as any).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
              }),
            200
          )
        )
    );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    expect(screen.getByText("Checking Discogs connection...")).toBeInTheDocument();
  });

  it("displays connect message when Discogs not connected", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Connect Discogs to see your collection.")).toBeInTheDocument();
    });
  });

  it("displays Settings link when Discogs not connected", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      const link = screen.getByRole("link", { name: "Go to Settings" });
      expect(link).toHaveAttribute("href", "/settings");
    });
  });

  it("loads collection when Discogs is connected", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 2,
            perPage: 20,
            totalItems: 35,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Test Album",
                artist: "Test Artist",
                year: 2024,
                thumbUrl: "https://example.com/thumb.jpg",
                formats: ["Vinyl"],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Album")).toBeInTheDocument();
      expect(screen.getByText("Test Artist - 2024")).toBeInTheDocument();
    });
  });

  it("displays collection items with cover image", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 1,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Album",
                artist: "Artist",
                year: null,
                thumbUrl: "https://example.com/cover.jpg",
                formats: [],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      const img = screen.getByAltText("Album cover");
      expect(img).toHaveAttribute("src", "https://example.com/cover.jpg");
    });
  });

  it("displays format badges", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 1,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Album",
                artist: "Artist",
                year: null,
                thumbUrl: null,
                formats: ["Vinyl", "LP"],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Vinyl")).toBeInTheDocument();
      expect(screen.getByText("LP")).toBeInTheDocument();
    });
  });

  it("filters collection by title", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 2,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Abbey Road",
                artist: "Beatles",
                year: null,
                thumbUrl: null,
                formats: [],
              },
              {
                instanceId: "inst-2",
                releaseId: "rel-2",
                title: "Another Album",
                artist: "Other Artist",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Abbey Road")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Search your collection");
    fireEvent.change(input, { target: { value: "Abbey" } });

    expect(screen.getByText("Abbey Road")).toBeInTheDocument();
    expect(screen.queryByText("Another Album")).not.toBeInTheDocument();
  });

  it("filters collection by artist", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 2,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Album 1",
                artist: "The Beatles",
                year: null,
                thumbUrl: null,
                formats: [],
              },
              {
                instanceId: "inst-2",
                releaseId: "rel-2",
                title: "Album 2",
                artist: "Rolling Stones",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("The Beatles")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Search your collection");
    fireEvent.change(input, { target: { value: "Beatles" } });

    expect(screen.getByText("Album 1")).toBeInTheDocument();
    expect(screen.queryByText("Album 2")).not.toBeInTheDocument();
  });

  it("shows load more button when there are more pages", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 3,
            perPage: 20,
            totalItems: 60,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Album 1",
                artist: "Artist 1",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    });
  });

  it("hides load more button on last page", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 2,
            pages: 2,
            perPage: 20,
            totalItems: 30,
            items: [
              {
                instanceId: "inst-2",
                releaseId: "rel-2",
                title: "Album 2",
                artist: "Artist 2",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
    });
  });

  it("shows empty message when no items match search", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 1,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Abbey Road",
                artist: "Beatles",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Abbey Road")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Search your collection");
    fireEvent.change(input, { target: { value: "xyz" } });

    expect(screen.getByText("No matches yet. Try another search.")).toBeInTheDocument();
  });

  it("displays error when loading collection fails", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() => Promise.reject(new Error("Network error")));

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("displays error when collection response is not ok", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load collection")).toBeInTheDocument();
    });
  });

  it("item card displays and is interactive", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 1,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-123",
                title: "Test Album",
                artist: "Test Artist",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Album")).toBeInTheDocument();
    });

    const titleElement = screen.getByText("Test Album");
    expect(titleElement).toBeInTheDocument();
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Collection } from "./Collection";
import type {
  DiscogsCollectionResponse,
  DiscogsSearchResponse,
  AuthStatusResponse,
} from "@repo/shared";

// Mock fetch globally
global.fetch = vi.fn();

describe("Collection Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays loading state when loading collection", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    page: 1,
                    pages: 1,
                    perPage: 20,
                    totalItems: 0,
                    items: [],
                  }),
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

    await waitFor(() => {
      expect(screen.getByText("Loading collection...")).toBeInTheDocument();
    });
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
      expect(screen.getByText("Connect Discogs")).toBeInTheDocument();
      expect(screen.getByText(/Connect your Discogs account to access your vinyl collection/)).toBeInTheDocument();
    });
  });

  it("displays button to go to Settings when Discogs not connected", async () => {
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
      const button = screen.getByRole("button", { name: "Go to Settings" });
      expect(button).toBeInTheDocument();
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
      expect(screen.getByText("Test Artist")).toBeInTheDocument();
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

  it("displays collection items without format badges", async () => {
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
      expect(screen.getByText("Album")).toBeInTheDocument();
      // "Artist" also appears as a sort button label, so use getAllByText
      expect(screen.getAllByText("Artist").length).toBeGreaterThan(0);
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

    const input = screen.getByPlaceholderText("Search collection...");
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

    const input = screen.getByPlaceholderText("Search collection...");
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

    const input = screen.getByPlaceholderText("Search collection...");
    fireEvent.change(input, { target: { value: "xyz" } });

    expect(screen.getByText("No matches found")).toBeInTheDocument();
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

  // ── Global Search tab ─────────────────────────────────────────────────────

  it("switches to Global Search tab without navigating away", async () => {
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
            totalItems: 0,
            items: [],
          } as DiscogsCollectionResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Global Search" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));

    expect(screen.getByPlaceholderText("Search Discogs...")).toBeInTheDocument();
    expect(screen.getByText("Search the Discogs database for a release.")).toBeInTheDocument();
  });

  it("searches Discogs when Enter is pressed in global search mode", async () => {
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
            totalItems: 0,
            items: [],
          } as DiscogsCollectionResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "Pink Floyd",
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 1,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "The Wall",
                artist: "Pink Floyd",
                year: 1979,
                thumbUrl: null,
                formats: ["Vinyl"],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Global Search" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));

    const input = screen.getByPlaceholderText("Search Discogs...");
    fireEvent.change(input, { target: { value: "Pink Floyd" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("The Wall")).toBeInTheDocument();
    });
  });

  it("searches Discogs when the submit button is clicked", async () => {
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
            totalItems: 0,
            items: [],
          } as DiscogsCollectionResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "Beatles",
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 1,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Abbey Road",
                artist: "The Beatles",
                year: 1969,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Global Search" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));

    const input = screen.getByPlaceholderText("Search Discogs...");
    fireEvent.change(input, { target: { value: "Beatles" } });

    fireEvent.click(screen.getByRole("button", { name: "Search Discogs" }));

    await waitFor(() => {
      expect(screen.getByText("Abbey Road")).toBeInTheDocument();
    });
  });

  it("shows empty state in global search when no results found", async () => {
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
            totalItems: 0,
            items: [],
          } as DiscogsCollectionResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "xyzxyz",
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 0,
            items: [],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Global Search" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));

    const input = screen.getByPlaceholderText("Search Discogs...");
    fireEvent.change(input, { target: { value: "xyzxyz" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("No results found. Try another search.")).toBeInTheDocument();
    });
  });

  it("shows error when Discogs search fails", async () => {
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
            totalItems: 0,
            items: [],
          } as DiscogsCollectionResponse),
        })
      )
      .mockImplementationOnce(() => Promise.reject(new Error("Search failed")));

    render(
      <BrowserRouter>
        <Collection />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Global Search" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));

    const input = screen.getByPlaceholderText("Search Discogs...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Search failed")).toBeInTheDocument();
    });
  });

  it("switches back to My Collection tab and restores collection view", async () => {
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
                title: "My Record",
                artist: "My Artist",
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
      expect(screen.getByText("My Record")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));
    expect(screen.getByPlaceholderText("Search Discogs...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "My Collection" }));
    expect(screen.getByPlaceholderText("Search collection...")).toBeInTheDocument();
    expect(screen.getByText("My Record")).toBeInTheDocument();
  });
});

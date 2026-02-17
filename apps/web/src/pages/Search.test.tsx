/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Search } from "./Search";
import type { DiscogsSearchResponse, AuthStatusResponse } from "@repo/shared";

// Mock fetch globally
global.fetch = vi.fn();

describe("Search Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays search page heading", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("displays Collection and Discogs Search tabs", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    expect(screen.getByRole("button", { name: "Collection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discogs Search" })).toBeInTheDocument();
  });

  it("Collection tab is active by default", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    // Collection tab is active by default, so search input should NOT be visible
    expect(screen.queryByPlaceholderText("Search Discogs releases")).not.toBeInTheDocument();
  });

  it("switches to Discogs Search tab", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    expect(screen.getByPlaceholderText("Search Discogs releases")).toBeInTheDocument();
  });

  it("displays search input and search button in Discogs tab", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    expect(screen.getByPlaceholderText("Search Discogs releases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("shows empty state message initially", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    expect(screen.getByText("Search Discogs for a release.")).toBeInTheDocument();
  });

  it("disables search button when query is empty", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const searchButton = screen.getByRole("button", { name: "Search" });
    expect(searchButton).toBeDisabled();
  });

  it("enables search button when query is not empty", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "Pink Floyd" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    expect(searchButton).not.toBeDisabled();
  });

  it("searches when search button is clicked", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
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
                thumbUrl: "https://example.com/thumb.jpg",
                formats: ["Vinyl"],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "Pink Floyd" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("The Wall")).toBeInTheDocument();
    });
  });

  it("searches when Enter key is pressed", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
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
                thumbUrl: "https://example.com/thumb.jpg",
                formats: ["Vinyl"],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "Beatles" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Abbey Road")).toBeInTheDocument();
    });
  });

  it("shows loading state during search", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
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
                    query: "test",
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
                        formats: [],
                      },
                    ],
                  } as DiscogsSearchResponse),
                }),
              100
            )
          )
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    expect(screen.getByText("Searching...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Album")).toBeInTheDocument();
    });
  });

  it("displays search results with title and artist", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "test",
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 2,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Album 1",
                artist: "Artist 1",
                year: 2020,
                thumbUrl: null,
                formats: [],
              },
              {
                instanceId: "inst-2",
                releaseId: "rel-2",
                title: "Album 2",
                artist: "Artist 2",
                year: 2021,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Album 1")).toBeInTheDocument();
      expect(screen.getByText("Artist 1 - 2020")).toBeInTheDocument();
      expect(screen.getByText("Album 2")).toBeInTheDocument();
      expect(screen.getByText("Artist 2 - 2021")).toBeInTheDocument();
    });
  });

  it("displays format information", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "test",
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
                formats: ["Vinyl", "LP", "Album"],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Vinyl · LP · Album")).toBeInTheDocument();
    });
  });

  it("shows 'No results' message when search returns empty", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "xyz",
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
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "xyz" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("No results yet. Try another search.")).toBeInTheDocument();
    });
  });

  it("shows error when search fails", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() => Promise.reject(new Error("Network error")));

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows error when response is not ok", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
        })
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Failed to search Discogs")).toBeInTheDocument();
    });
  });

  it("shows load more button when there are more pages", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "test",
            page: 1,
            pages: 3,
            perPage: 20,
            totalItems: 60,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Album",
                artist: "Artist",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    });
  });

  it("hides load more when on last page", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            query: "test",
            page: 3,
            pages: 3,
            perPage: 20,
            totalItems: 60,
            items: [
              {
                instanceId: "inst-1",
                releaseId: "rel-1",
                title: "Album",
                artist: "Artist",
                year: null,
                thumbUrl: null,
                formats: [],
              },
            ],
          } as DiscogsSearchResponse),
        })
      );

    render(
      <BrowserRouter>
        <Search />
      </BrowserRouter>
    );

    const discogsButton = screen.getByRole("button", { name: "Discogs Search" });
    fireEvent.click(discogsButton);

    const input = screen.getByPlaceholderText("Search Discogs releases");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });
  });
});


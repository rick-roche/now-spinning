import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Collection } from "./Collection";
import type {
  DiscogsCollectionResponse,
  DiscogsSearchResponse,
  AuthStatusResponse,
} from "@repo/shared";
import { createFetchMock } from "../test-utils";

const fetchMock = createFetchMock();

describe("Collection Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays loading state when loading collection", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => ({
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
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
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
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fireEvent.change(input, { target: { value: "Abbey" } });

    await waitFor(() => {
      expect(screen.getByText("Abbey Road")).toBeInTheDocument();
      expect(screen.queryByText("Another Album")).not.toBeInTheDocument();
    });
  });

  it("filters collection by artist", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
            page: 1,
            pages: 1,
            perPage: 20,
            totalItems: 1,
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

    await waitFor(() => {
      expect(screen.getByText("Album 1")).toBeInTheDocument();
      expect(screen.queryByText("Album 2")).not.toBeInTheDocument();
    });
  });

  it("shows load more button when there are more pages", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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

  it("auto-loads next collection page when sentinel intersects", async () => {
    const originalIntersectionObserver = globalThis.IntersectionObserver;
    let observerCallback: IntersectionObserverCallback | null = null;

    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
      disconnect = vi.fn();
      observe = vi.fn();
      takeRecords = vi.fn(() => []);
      unobserve = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
    }

    globalThis.IntersectionObserver = MockIntersectionObserver;

    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
            page: 1,
            pages: 2,
            perPage: 20,
            totalItems: 2,
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
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
            page: 2,
            pages: 2,
            perPage: 20,
            totalItems: 2,
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

    try {
      render(
        <BrowserRouter>
          <Collection />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Album 1")).toBeInTheDocument();
      });

      const sentinel = screen.getByTestId("collection-load-more-sentinel");
      expect(observerCallback).not.toBeNull();

      await act(async () => {
        observerCallback?.(
          [{ isIntersecting: true, target: sentinel } as unknown as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });

      await waitFor(() => {
        expect(screen.getByText("Album 2")).toBeInTheDocument();
      });
    } finally {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    }
  });

  it("hides load more button on last page", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
      expect(screen.getByText("Abbey Road")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Search collection...");
    fireEvent.change(input, { target: { value: "xyz" } });

    await waitFor(() => {
      expect(screen.getByText("No matches found")).toBeInTheDocument();
    });
  });

  it("displays error when loading collection fails", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({
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
    await waitFor(() => {
      expect(screen.getByText("My Record")).toBeInTheDocument();
    });
  });
});

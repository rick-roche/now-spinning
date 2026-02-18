/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Release } from "./Release";
import type { DiscogsReleaseResponse, NormalizedRelease } from "@repo/shared";

// Mock fetch globally
global.fetch = vi.fn();

describe("Release Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockRelease: NormalizedRelease = {
    id: "12345",
    title: "The Dark Side of the Moon",
    artist: "Pink Floyd",
    year: 1973,
    coverUrl: "https://example.com/cover.jpg",
    tracks: [
      {
        index: 0,
        position: "A1",
        title: "Speak to Me",
        artist: "Pink Floyd",
        durationSec: 90,
        side: "A",
      },
      {
        index: 1,
        position: "A2",
        title: "Breathe",
        artist: "Pink Floyd",
        durationSec: 163,
        side: "A",
      },
      {
        index: 2,
        position: "B1",
        title: "Time",
        artist: "Pink Floyd",
        durationSec: 421,
        side: "B",
      },
    ],
  };

  const renderWithRouter = () => {
    return render(
      <MemoryRouter initialEntries={["/release/12345"]}>
        <Routes>
          <Route path="/release/:id" element={<Release />} />
          <Route path="/search" element={<div>Search Page</div>} />
          <Route path="/session" element={<div>Session Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it("displays loading state initially", () => {
    (global.fetch as any).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
              }),
            100
          )
        )
    );

    renderWithRouter();

    expect(screen.getByText("Loading release...")).toBeInTheDocument();
  });

  it("displays error when release id is missing", async () => {
    render(
      <MemoryRouter initialEntries={["/release/"]}>
        <Routes>
          <Route path="/release" element={<Release />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Missing release id.")).toBeInTheDocument();
    });
  });

  it("displays release information when loaded", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("The Dark Side of the Moon")).toBeInTheDocument();
    });

    expect(screen.getByText("Pink Floyd · 1973")).toBeInTheDocument();
    expect(screen.getByText("The Dark Side of the Moon")).toBeInTheDocument();
  });

  it("displays cover image when available", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      const img = screen.getByAltText("The Dark Side of the Moon cover");
      expect(img).toHaveAttribute("src", "https://example.com/cover.jpg");
    });
  });

  it("groups tracks by side", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Side A")).toBeInTheDocument();
      expect(screen.getByText("Side B")).toBeInTheDocument();
    });
  });

  it("displays all track information", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Speak to Me")).toBeInTheDocument();
      expect(screen.getByText("Breathe")).toBeInTheDocument();
      expect(screen.getByText("Time")).toBeInTheDocument();
    });
  });

  it("formats track durations correctly", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("1:30")).toBeInTheDocument(); // 90 seconds
      expect(screen.getByText("2:43")).toBeInTheDocument(); // 163 seconds
      expect(screen.getByText("7:01")).toBeInTheDocument(); // 421 seconds
    });
  });

  it("displays artist name for track if different from release artist", async () => {
    const releaseWithDifferentArtists: NormalizedRelease = {
      ...mockRelease,
      tracks: [
        {
          index: 0,
          position: "A1",
          title: "Collaboration",
          artist: "Other Artist",
          durationSec: 240,
          side: "A",
        },
      ],
    };

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: releaseWithDifferentArtists } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Other Artist")).toBeInTheDocument();
    });
  });

  it("handles null duration gracefully", async () => {
    const releaseWithNullDuration: NormalizedRelease = {
      ...mockRelease,
      tracks: [
        {
          index: 0,
          position: "A1",
          title: "Track",
          artist: "Artist",
          durationSec: null,
          side: "A",
        },
      ],
    };

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: releaseWithNullDuration } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  it("displays error message on fetch failure", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Failed to load release")).toBeInTheDocument();
    });
  });

  it("displays error when fetch rejects", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.reject(new Error("Network error"))
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("displays Start Session button", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Scrobbling/i })).toBeInTheDocument();
    });
  });

  it("calls session start endpoint when Start Session button clicked", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
        })
      );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Scrobbling/i })).toBeInTheDocument();
    });

    const startButton = screen.getByRole("button", { name: /Start Scrobbling/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect((global.fetch as any).mock.calls[1][0]).toContain("/api/session/start");
    });
  });

  it("navigates to session after start success", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
        })
      );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Scrobbling/i })).toBeInTheDocument();
    });

    const startButton = screen.getByRole("button", { name: /Start Scrobbling/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText("Session Page")).toBeInTheDocument();
    });
  });

  it("handles session start error", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: { message: "Session start failed" } }),
        })
      );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Scrobbling/i })).toBeInTheDocument();
    });

    const startButton = screen.getByRole("button", { name: /Start Scrobbling/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText("Session start failed")).toBeInTheDocument();
    });
  });

  it("displays year when available", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Pink Floyd · 1973")).toBeInTheDocument();
    });
  });

  it("omits year when not available", async () => {
    const releaseNoYear: NormalizedRelease = {
      ...mockRelease,
      year: null,
    };

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ release: releaseNoYear } satisfies DiscogsReleaseResponse<NormalizedRelease>),
      })
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Pink Floyd")).toBeInTheDocument();
    });

    // Should not contain the year separator
    const artistText = screen.getByText("Pink Floyd");
    expect(artistText.textContent).not.toContain("·");
  });

  it("disables Start Session button while starting", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ release: mockRelease } satisfies DiscogsReleaseResponse<NormalizedRelease>),
        })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                }),
              100
            )
          )
      );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start Scrobbling/i })).toBeInTheDocument();
    });

    const startButton = screen.getByRole("button", { name: /Start Scrobbling/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Starting.../i })).toBeDisabled();
    });
  });
});

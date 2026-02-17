/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import type { Session, SessionCurrentResponse } from "@repo/shared";
import { SessionPage } from "./Session";

// Mock fetch globally
global.fetch = vi.fn();

const mockSession: Session = {
  id: "sess-123",
  state: "running",
  currentIndex: 0,
  userId: "user-1",
  startedAt: Date.now() - 10000,
  release: {
    id: "rel-1",
    title: "Test Album",
    artist: "Test Artist",
    year: 2024,
    coverUrl: null,
    tracks: [
      {
        index: 0,
        position: "A1",
        title: "First Track",
        artist: "Test Artist",
        durationSec: 240,
        side: "A" as const,
      },
      {
        index: 1,
        position: "A2",
        title: "Second Track",
        artist: "Test Artist",
        durationSec: 180,
        side: "A" as const,
      },
    ],
  },
  tracks: [
    {
      index: 0,
      status: "pending",
      startedAt: null,
      scrobbledAt: null,
    },
    {
      index: 1,
      status: "pending",
      startedAt: null,
      scrobbledAt: null,
    },
  ],
};

const renderSessionPage = () => {
  return render(
    <BrowserRouter>
      <SessionPage />
    </BrowserRouter>
  );
};

describe("SessionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays loading state initially", () => {
    (global.fetch as any).mockImplementationOnce(
      () =>
        new Promise(() => {
          /* Never resolves */
        })
    );

    // Mock health check
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    expect(screen.getByText("Loading session...")).toBeInTheDocument();
  });

  it("displays error state when session fetch fails", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      })
    );

    // Mock health check
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load session")).toBeInTheDocument();
    });
  });

  it("displays no session state when session is null", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: null } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("No active session")).toBeInTheDocument();
      expect(screen.getByText("Pick a release to start listening.")).toBeInTheDocument();
    });
  });

  it("displays active session information", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Now Playing")).toBeInTheDocument();
    });

    expect(screen.getByText("Test Artist")).toBeInTheDocument();
    expect(screen.getByText("Test Album")).toBeInTheDocument();
  });

  it("displays current track information", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("A1. First Track")).toBeInTheDocument();
    });
  });

  it("displays status badge with Playing when session is running", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Playing")).toBeInTheDocument();
    });
  });

  it("displays status badge with Paused when session is paused", async () => {
    const pausedSession = { ...mockSession, state: "paused" as const };

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: pausedSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Paused")).toBeInTheDocument();
    });
  });

  it("displays Pause button when session is running", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });
  });

  it("displays Resume button when session is paused", async () => {
    const pausedSession = { ...mockSession, state: "paused" as const };

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: pausedSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    });
  });

  it("displays Next Track button", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Next Track" })).toBeInTheDocument();
    });
  });

  it("displays progress bar for tracks with duration", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });
  });

  it("displays elapsed and remaining time", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText(/elapsed/)).toBeInTheDocument();
      expect(screen.getByText(/left/)).toBeInTheDocument();
    });
  });

  it("displays auto-advance message in non-dev mode", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Auto-advance on track end")).toBeInTheDocument();
    });
  });

  it("displays dev mode message when in dev mode", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: true }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText(/DEV MODE: Scrobbles logged only/)).toBeInTheDocument();
    });
  });

  it("displays Back to Search link", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      const backLinks = screen.getAllByText("Back to Search");
      expect(backLinks.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles pause action", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ devMode: false }),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              session: { ...mockSession, state: "paused" },
            } satisfies SessionCurrentResponse),
        })
      );

    renderSessionPage();

    const pauseButton = await screen.findByRole("button", { name: "Pause" });
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/session/sess-123/pause", {
        method: "POST",
      });
    });
  });

  it("handles resume action", async () => {
    const pausedSession = { ...mockSession, state: "paused" as const };

    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: pausedSession } satisfies SessionCurrentResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ devMode: false }),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              session: { ...pausedSession, state: "running" },
            } satisfies SessionCurrentResponse),
        })
      );

    renderSessionPage();

    const resumeButton = await screen.findByRole("button", { name: "Resume" });
    fireEvent.click(resumeButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/session/sess-123/resume", {
        method: "POST",
      });
    });
  });

  it("handles next track action", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ devMode: false }),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              session: { ...mockSession, currentIndex: 1 },
            } satisfies SessionCurrentResponse),
        })
      );

    renderSessionPage();

    const nextButton = await screen.findByRole("button", { name: "Next Track" });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/session/sess-123/next", {
        method: "POST",
      });
    });
  });

  it("displays error message when action fails", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ devMode: false }),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: { message: "Action failed" },
            }),
        })
      );

    renderSessionPage();

    const pauseButton = await screen.findByRole("button", { name: "Pause" });
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(screen.getByText("Action failed")).toBeInTheDocument();
    });
  });

  it("displays Browse Discogs link when no session", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: null } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      const browseLinks = screen.getAllByText("Browse Discogs");
      expect(browseLinks.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles session with track without duration", async () => {
    const sessionNoDuration = {
      ...mockSession,
      release: {
        ...mockSession.release,
        tracks: [
          {
            index: 0,
            position: "A1",
            title: "Unknown Duration Track",
            artist: "Test Artist",
            durationSec: 0,
            side: "A" as const,
          },
        ],
      },
    };

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            session: sessionNoDuration,
          } satisfies SessionCurrentResponse),
      })
    );

    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ devMode: false }),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Duration unknown, auto-advance unavailable.")).toBeInTheDocument();
    });
  });

  it("updates current track when advancing", async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ devMode: false }),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              session: { ...mockSession, currentIndex: 1 },
            } satisfies SessionCurrentResponse),
        })
      );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("A1. First Track")).toBeInTheDocument();
    });

    const nextButton = screen.getByRole("button", { name: "Next Track" });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText("A2. Second Track")).toBeInTheDocument();
    });
  });
});

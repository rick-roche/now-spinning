import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import type { Session, SessionCurrentResponse } from "@repo/shared";
import { SessionPage } from "./Session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchMock = vi.fn() as any;
global.fetch = fetchMock;

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
    vi.resetAllMocks();
    global.fetch = fetchMock;
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("displays loading state initially", () => {
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(() => {
          /* Never resolves */
        })
    );

    // Mock health check

    renderSessionPage();

    expect(screen.getByText("Loading session...")).toBeInTheDocument();
  });

  it("falls back to no session state when session fetch fails", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      })
    );

    // Mock health check

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("No active session")).toBeInTheDocument();
      expect(screen.getByText("Pick a release to start listening.")).toBeInTheDocument();
    });
  });

  it("displays no session state when session is null", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: null } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("No active session")).toBeInTheDocument();
      expect(screen.getByText("Pick a release to start listening.")).toBeInTheDocument();
    });
  });

  it("displays active session information", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Now Playing")).toBeInTheDocument();
      expect(screen.getByText("Test Artist")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "First Track" })).toBeInTheDocument();
    });
  });

  it("displays current track information", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "First Track" })).toBeInTheDocument();
      expect(screen.getAllByText("A1").length).toBeGreaterThan(0);
    });
  });

  it("displays status badge when session is running", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Now Playing")).toBeInTheDocument();
      expect(screen.getByText("Syncing to Last.fm")).toBeInTheDocument();
    });
  });

  it("displays pause button label when session is running", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Pause Scrobble")).toBeInTheDocument();
    });
  });

  it("displays Pause button when session is running", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Pause Scrobble")).toBeInTheDocument();
    });
  });

  it("displays Resume button when session is paused", async () => {
    const pausedSession = { ...mockSession, state: "paused" as const };

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: pausedSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Resume")).toBeInTheDocument();
    });
  });

  it("displays Skip Track button", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Skip Track")).toBeInTheDocument();
    });
  });

  it("displays progress bar for tracks with duration", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("0:00")).toBeInTheDocument();
      expect(screen.getByText("4:00")).toBeInTheDocument();
    });
  });

  it("displays elapsed and remaining time", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("0:00")).toBeInTheDocument();
      expect(screen.getByText("4:00")).toBeInTheDocument();
    });
  });

  it("displays upcoming tracks section", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Coming up")).toBeInTheDocument();
      expect(screen.getByText("Playing now")).toBeInTheDocument();
    });
  });

  it("displays session page when in dev mode", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Now Playing")).toBeInTheDocument();
    });
  });

  it("displays track list with current track", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "First Track" })).toBeInTheDocument();
      expect(screen.getByText("Second Track")).toBeInTheDocument();
    });
  });

  it("handles pause action", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
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

    await waitFor(() => {
      expect(screen.getByText("Pause Scrobble")).toBeInTheDocument();
    });

    const pauseButton = screen.getByText("Pause Scrobble").closest("button")!;
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/session/sess-123/pause", {
        credentials: "include",
        method: "POST",
      });
    });
  });

  it("handles resume action", async () => {
    const pausedSession = { ...mockSession, state: "paused" as const };

    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: pausedSession } satisfies SessionCurrentResponse),
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

    await waitFor(() => {
      expect(screen.getByText("Resume")).toBeInTheDocument();
    });

    const resumeButton = screen.getByText("Resume").closest("button")!;
    fireEvent.click(resumeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/session/sess-123/resume", {
        credentials: "include",
        method: "POST",
      });
    });
  });

  it("handles next track action", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
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
      expect(screen.getByText("Skip Track")).toBeInTheDocument();
    });

    const nextButton = screen.getByText("Skip Track").closest("button")!;
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/session/sess-123/next", {
        credentials: "include",
        method: "POST",
      });
    });
  });

  it("displays error message when action fails", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
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

    await waitFor(() => {
      expect(screen.getByText("Pause Scrobble")).toBeInTheDocument();
    });

    const pauseButton = screen.getByText("Pause Scrobble").closest("button")!;
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(screen.getByText("Action failed")).toBeInTheDocument();
    });
  });

  it("displays Browse Collection link when no session", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: null } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Browse Collection")).toBeInTheDocument();
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

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            session: sessionNoDuration,
          } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Duration unknown")).toBeInTheDocument();
    });
  });

  it("updates current track when advancing", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
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
      expect(screen.getByRole("heading", { name: "First Track" })).toBeInTheDocument();
      expect(screen.getAllByText("A1").length).toBeGreaterThan(0);
    });

    const nextButton = screen.getByText("Skip Track").closest("button")!;
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText("A2")).toBeInTheDocument();
      expect(screen.getByText("Second Track")).toBeInTheDocument();
    });
  });
});

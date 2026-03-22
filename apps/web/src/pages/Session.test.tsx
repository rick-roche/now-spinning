import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import type { Session, SessionCurrentResponse } from "@repo/shared";
import { SessionPage } from "./Session";
import { createFetchMock } from "../test-utils";

const fetchMock = createFetchMock();

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
    global.fetch = fetchMock as unknown as typeof fetch;
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

    expect(screen.getByTestId("session-skeleton")).toBeInTheDocument();
  });

  it("falls back to error state when session fetch fails", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: "Failed to load session" } }),
      })
    );

    // Mock health check

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load session")).toBeInTheDocument();
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

  it("exits loading state after session loads", async () => {
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

    expect(screen.queryByTestId("session-skeleton")).not.toBeInTheDocument();
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
      expect(screen.getByLabelText("Pause")).toBeInTheDocument();
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
      expect(screen.getByLabelText("Pause")).toBeInTheDocument();
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
      expect(screen.getByLabelText("Play")).toBeInTheDocument();
    });
  });

  it("displays next track button", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ session: mockSession } satisfies SessionCurrentResponse),
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByLabelText("Next track")).toBeInTheDocument();
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
      expect(screen.getByLabelText("Pause")).toBeInTheDocument();
    });

    const pauseButton = screen.getByLabelText("Pause");
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
      expect(screen.getByLabelText("Play")).toBeInTheDocument();
    });

    const resumeButton = screen.getByLabelText("Play");
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
      expect(screen.getByLabelText("Next track")).toBeInTheDocument();
    });

    const nextButton = screen.getByLabelText("Next track");
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
      expect(screen.getByLabelText("Pause")).toBeInTheDocument();
    });

    const pauseButton = screen.getByLabelText("Pause");
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
      expect(screen.getByText("--:--")).toBeInTheDocument();
    });
  });

  it("has navigation buttons when session is loaded", async () => {
    fetchMock
      .mockImplementationOnce(() =>
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

    // Verify navigation buttons are present
    expect(screen.getByLabelText("Previous track")).toBeInTheDocument();
    expect(screen.getByLabelText("Next track")).toBeInTheDocument();
    expect(screen.getByLabelText(/Pause|Play/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End Session" })).toBeInTheDocument();
  });

  describe("session completion view", () => {
    const endedSession: Session = {
      ...mockSession,
      state: "ended",
      currentIndex: 1,
      tracks: [
        {
          index: 0,
          status: "scrobbled",
          startedAt: Date.now() - 300000,
          scrobbledAt: Date.now() - 60000,
        },
        {
          index: 1,
          status: "scrobbled",
          startedAt: Date.now() - 60000,
          scrobbledAt: Date.now() - 1000,
        },
      ],
    };

    it("displays session complete view when session state is ended", async () => {
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: endedSession } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("Session Complete")).toBeInTheDocument();
      });

      expect(screen.getByRole("heading", { name: "Test Album" })).toBeInTheDocument();
      expect(screen.getAllByText("Test Artist").length).toBeGreaterThanOrEqual(1);
    });

    it("shows scrobbled track count", async () => {
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: endedSession } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("Scrobbled")).toBeInTheDocument();
      });

      const scrobbledLabel = screen.getByText("Scrobbled");
      const scrobbledCard = scrobbledLabel.closest("div");
      expect(scrobbledCard).toHaveTextContent("2");
    });

    it("shows total track count", async () => {
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: endedSession } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("Tracks")).toBeInTheDocument();
      });
    });

    it("shows tracklist with track titles", async () => {
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: endedSession } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("Tracklist")).toBeInTheDocument();
        expect(screen.getByText("First Track")).toBeInTheDocument();
        expect(screen.getByText("Second Track")).toBeInTheDocument();
      });
    });

    it("shows Browse Collection link", async () => {
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: endedSession } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("Browse Collection")).toBeInTheDocument();
      });
    });

    it("dismiss button returns to no-session state", async () => {
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: endedSession } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("Session Complete")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Dismiss"));

      await waitFor(() => {
        expect(screen.getByText("No active session")).toBeInTheDocument();
      });
    });

    it("does not show playback controls when session is ended", async () => {
      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: endedSession } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("Session Complete")).toBeInTheDocument();
      });

      expect(screen.queryByText("Now Playing")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Pause")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Next track")).not.toBeInTheDocument();
    });

    it("shows skipped tracks with skipped count", async () => {
      const sessionWithSkip: Session = {
        ...endedSession,
        tracks: [
          {
            index: 0,
            status: "scrobbled",
            startedAt: Date.now() - 300000,
            scrobbledAt: Date.now() - 60000,
          },
          {
            index: 1,
            status: "skipped",
            startedAt: null,
            scrobbledAt: null,
          },
        ],
      };

      fetchMock.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ session: sessionWithSkip } satisfies SessionCurrentResponse),
        })
      );

      renderSessionPage();

      await waitFor(() => {
        expect(screen.getByText("1 skipped")).toBeInTheDocument();
      });
    });
  });
});

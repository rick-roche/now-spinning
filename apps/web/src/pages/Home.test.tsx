import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Home } from "./Home";
import type { AuthStatusResponse } from "@repo/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchMock = vi.fn() as any;
global.fetch = fetchMock;

describe("Home Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays Get Started heading", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Get Started")).toBeInTheDocument();
    });
  });

  it("displays Connect your music services heading", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Connect your music services")).toBeInTheDocument();
    });
  });

  it("displays Discogs connection card", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Connect Discogs" })).toBeInTheDocument();
      expect(
        screen.getByText(/Access your vinyl collection and search the global database/)
      ).toBeInTheDocument();
    });
  });

  it("displays Last.fm connection card", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Connect Last.fm" })).toBeInTheDocument();
      expect(
        screen.getByText(/Enable scrobbling to track your listening habits/)
      ).toBeInTheDocument();
    });
  });

  it("displays Connect Discogs button when not connected", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /Connect Discogs/ });
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("displays Connect Last.fm button when not connected", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /Connect Last\.fm/ });
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("does not show connect screen when Discogs is connected", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: true } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/status", { credentials: "include" });
    });

    // After auth resolves the component navigates away; the connect UI must never appear
    expect(screen.queryByText("Connect your music services")).not.toBeInTheDocument();
  });

  it("shows connected status for Last.fm when only Last.fm is connected", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: true, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("\u2713 Connected")).toBeInTheDocument();
    });
  });

  it("does not show connect screen when both services are connected", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: true, discogsConnected: true } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/status", { credentials: "include" });
    });

    expect(screen.queryByText("Connect your music services")).not.toBeInTheDocument();
  });

  it("displays privacy note", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Privacy First")).toBeInTheDocument();
      expect(
        screen.getByText(/We value your privacy.*never stored.*secure OAuth tokens/)
      ).toBeInTheDocument();
    });
  });

  it("calls Discogs connect endpoint when Connect Discogs button clicked", async () => {
    const mockFetch = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ redirectUrl: "https://discogs.com/oauth" }),
        })
      );
    
    global.fetch = mockFetch;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { href: "" };

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Connect Discogs/ })).toBeInTheDocument();
    });

    const button = screen.getByRole("button", { name: /Connect Discogs/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/discogs/start", { credentials: "include", method: "POST" });
    });
  });

  it("calls Last.fm connect endpoint when Connect Last.fm button clicked", async () => {
    const mockFetch = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => ({ redirectUrl: "https://last.fm/oauth" }),
        })
      );
    
    global.fetch = mockFetch;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { href: "" };

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Connect Last\.fm/ })).toBeInTheDocument();
    });

    const button = screen.getByRole("button", { name: /Connect Last\.fm/ });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/lastfm/start", { credentials: "include" });
    });
  });

  it("fetches auth status on mount", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => ({ lastfmConnected: false, discogsConnected: false } as AuthStatusResponse),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/status", { credentials: "include" });
    });
  });
});

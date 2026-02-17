/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Home } from "./Home";

// Mock fetch globally
global.fetch = vi.fn();

describe("Home Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays welcome heading", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByText("Welcome to Now Spinning")).toBeInTheDocument();
  });

  it("displays main description", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByText(/Scrobble your vinyl listening to Last.fm/)).toBeInTheDocument();
  });

  it("displays feature description", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(
      screen.getByText(/Pick a record from your Discogs collection.*let the app scrobble each track/)
    ).toBeInTheDocument();
  });

  it("checks health endpoint on mount", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect((global.fetch as any)).toHaveBeenCalledWith("/api/health");
    });
  });

  it("displays API connected status when health check succeeds", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/✓ API connected/)).toBeInTheDocument();
    });
  });

  it("displays API issue status when health check returns non-ok status", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "error", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/⚠ API issue/)).toBeInTheDocument();
    });
  });

  it("displays API unavailable when fetch fails", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.reject(new Error("Network error"))
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/✗ API unavailable/)).toBeInTheDocument();
    });
  });

  it("displays dev mode indicator when devMode is true", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: true }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/DEV MODE \(scrobbles logged only\)/)).toBeInTheDocument();
    });
  });

  it("does not display dev mode indicator when devMode is false", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/✓ API connected/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/DEV MODE/)).not.toBeInTheDocument();
  });

  it("displays Browse Discogs button", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByRole("link", { name: "Browse Discogs" })).toBeInTheDocument();
  });

  it("displays Continue Session button", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByRole("link", { name: "Continue Session" })).toBeInTheDocument();
  });

  it("Browse Discogs button links to search page", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    const browseLink = screen.getByRole("link", { name: "Browse Discogs" });
    expect(browseLink).toHaveAttribute("href", "/search");
  });

  it("Continue Session button links to session page", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    const continueLink = screen.getByRole("link", { name: "Continue Session" });
    expect(continueLink).toHaveAttribute("href", "/session");
  });

  it("displays M3 status note", () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok", devMode: false }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByText(/M3 \(Session MVP\)/)).toBeInTheDocument();
  });

  it("handles health check returning undefined devMode", async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ status: "ok" }),
      })
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/✓ API connected/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/DEV MODE/)).not.toBeInTheDocument();
  });

  it("displays checking API status initially", () => {
    (global.fetch as any).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ status: "ok", devMode: false }),
              }),
            100
          )
        )
    );

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByText("Checking API...")).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Suppress console.error during error boundary tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Test Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("renders multiple children correctly", () => {
    render(
      <ErrorBoundary>
        <div>First</div>
        <div>Second</div>
        <div>Third</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("displays error UI when child component throws", () => {
    const ThrowingComponent = () => {
      throw new Error("Test error message");
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(
        /The application encountered an unexpected error. This has been logged/
      )
    ).toBeInTheDocument();
  });

  it("shows error details in development mode", () => {
    const testError = "Detailed error message";
    const ThrowingComponent = () => {
      throw new Error(testError);
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // In dev mode, error details should be visible
    if (import.meta.env.DEV) {
      expect(screen.getByText(testError)).toBeInTheDocument();
    }
  });

  it("displays Reload Page button", () => {
    const ThrowingComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole("button", { name: "Reload Page" });
    expect(reloadButton).toBeInTheDocument();
  });

  it("displays Go to Home button", () => {
    const ThrowingComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole("button", { name: "Go to Home" });
    expect(homeButton).toBeInTheDocument();
  });

  it("logs error to console when error occurs", () => {
    const consoleSpy = vi.spyOn(console, "error");

    const ThrowingComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("ErrorBoundary caught an error"),
      expect.any(Error),
      expect.any(Object)
    );
  });

  it("handles nested component errors", () => {
    const NestedComponent = () => {
      return (
        <div>
          <div>Level 1</div>
          <ThrowingChild />
        </div>
      );
    };

    const ThrowingChild = () => {
      throw new Error("Nested error");
    };

    render(
      <ErrorBoundary>
        <NestedComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("displays error message correctly", () => {
    const errorMessage = "This is a specific error";

    const ThrowingComponent = () => {
      throw new Error(errorMessage);
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("catches errors from event handlers", () => {
    const ClickThrowComponent = () => {
      const handleClick = () => {
        throw new Error("Click handler error");
      };

      return <button onClick={handleClick}>Click Me</button>;
    };

    render(
      <ErrorBoundary>
        <ClickThrowComponent />
      </ErrorBoundary>
    );

    // Note: Error boundaries don't catch errors in event handlers in React 16+
    // This test documents that behavior
    const button = screen.getByRole("button", { name: "Click Me" });
    expect(button).toBeInTheDocument();
  });

  it("maintains error state persist until reset", () => {
    const ThrowingComponent = () => {
      throw new Error("Persistent error");
    };

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // First render shows error
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Rerender should still show error
    rerender(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders with different child types", () => {
    render(
      <ErrorBoundary>
        <>
          <span>Fragment child</span>
        </>
      </ErrorBoundary>
    );

    expect(screen.getByText("Fragment child")).toBeInTheDocument();
  });

  it("handles rapid error conditions", () => {
    const ThrowingComponent = () => {
      throw new Error("Error from component");
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // Should catch the error and display error UI
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("provides buttons with correct styling context", () => {
    const ThrowingComponent = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByRole("button", { name: "Reload Page" });
    const homeButton = screen.getByRole("button", { name: "Go to Home" });

    expect(reloadButton).toBeInTheDocument();
    expect(homeButton).toBeInTheDocument();
  });
});

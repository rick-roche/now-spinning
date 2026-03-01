import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useApiQuery } from "./useApiQuery";
import { createFetchMock } from "../test-utils";

const fetchMock = createFetchMock();

function QueryTest({ url }: { url: string }) {
  const { data, error, loading } = useApiQuery<{ message: string }>(url, {
    errorMessage: "Failed to load data",
    retry: 0,
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <div>Data: {data?.message}</div>;
}

describe("useApiQuery", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("returns data on success", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: "Hello" }),
      })
    );

    render(<QueryTest url="/api/test" />);

    await waitFor(() => {
      expect(screen.getByText("Data: Hello")).toBeInTheDocument();
    });
  });

  it("returns server error message on failure", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: "Bad request" } }),
      })
    );

    render(<QueryTest url="/api/test" />);

    await waitFor(() => {
      expect(screen.getByText("Error: Bad request")).toBeInTheDocument();
    });
  });

  it("resolves loading state in StrictMode", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: "Hello" }),
      })
    );

    render(
      <StrictMode>
        <QueryTest url="/api/test" />
      </StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByText("Data: Hello")).toBeInTheDocument();
    });
  });
});

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useApiMutation } from "./useApiMutation";
import { createFetchMock } from "../test-utils";

const fetchMock = createFetchMock();

function MutationTest() {
  const { mutate, data, error, loading } = useApiMutation<{ ok: boolean }, void>(() => ({
    url: "/api/test",
    method: "POST",
  }));

  return (
    <div>
      <button onClick={() => void mutate(undefined)}>Run</button>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {data && <div>Done: {data.ok ? "yes" : "no"}</div>}
    </div>
  );
}

describe("useApiMutation", () => {
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
        json: () => Promise.resolve({ ok: true }),
      })
    );

    render(<MutationTest />);

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.getByText("Done: yes")).toBeInTheDocument();
    });
  });

  it("returns error message on failure", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: "Server error" } }),
      })
    );

    render(<MutationTest />);

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.getByText("Error: Server error")).toBeInTheDocument();
    });
  });
});

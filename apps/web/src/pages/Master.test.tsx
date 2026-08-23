import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Master } from "./Master";
import { createFetchMock } from "../test-utils";

const fetchMock = createFetchMock();

describe("Master Page", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it("selects a medium and navigates to a pressing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      masterId: "123",
      versions: [
        { releaseId: "456", title: "Vinyl pressing", year: 1973, thumbUrl: null, formats: ["Vinyl"], mediaType: "vinyl" },
        { releaseId: "789", title: "CD pressing", year: 2000, thumbUrl: null, formats: ["CD"], mediaType: "cd" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(
      <MemoryRouter initialEntries={["/master/123"]}>
        <Routes>
          <Route path="/master/:id" element={<Master />} />
          <Route path="/release/:id" element={<p>Release page</p>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "vinyl" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "vinyl" }));
    fireEvent.click(screen.getByRole("button", { name: /Vinyl pressing/ }));

    expect(await screen.findByText("Release page")).toBeInTheDocument();
  });
});

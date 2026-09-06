import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useVisibilityResume } from "./useVisibilityResume";

function Harness() {
  useVisibilityResume("session-1", false, { onSync: vi.fn() });
  return null;
}

describe("useVisibilityResume", () => {
  it("syncs on initial visible mount, visibilitychange, and pageshow regardless of local state", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ session: {}, scrobbledCount: 0 }) } as Response);
    render(<Harness />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.dispatchEvent(new PageTransitionEvent("pageshow"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    fetchMock.mockRestore();
  });
});

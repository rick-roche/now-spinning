import type { Mock } from "vitest";
import { vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FetchMock = Mock<(...args: Parameters<typeof fetch>) => any>;

/**
 * Creates a properly typed fetch mock and installs it on `global.fetch`.
 * Call in `beforeEach` or at the module level.
 */
export function createFetchMock(): FetchMock {
  const mock = vi.fn() as FetchMock;
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

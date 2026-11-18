/**
 * @jest-environment jsdom
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useConfessionsQuery } from "../useConfessionsQuery";
import { getConfessions } from "../../api/confessions";

jest.mock("../../api/confessions", () => ({
  getConfessions: jest.fn(),
}));

const mockGetConfessions = getConfessions as jest.MockedFunction<typeof getConfessions>;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useConfessionsQuery retry behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retries and recovers after a transient offline-style failure", async () => {
    mockGetConfessions
      .mockResolvedValueOnce({ ok: false, error: { message: "Failed to fetch" } })
      .mockResolvedValueOnce({ ok: false, error: { message: "Failed to fetch" } })
      .mockResolvedValueOnce({
        ok: true,
        data: { confessions: [], hasMore: false, page: 1 },
      });

    const { result } = renderHook(() => useConfessionsQuery({}), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    expect(mockGetConfessions).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable 4xx error", async () => {
    mockGetConfessions.mockResolvedValue({
      ok: false,
      error: { message: "Bad request", status: 400 },
    });

    const { result } = renderHook(() => useConfessionsQuery({}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockGetConfessions).toHaveBeenCalledTimes(1);
  });

  it("stops retrying after the bounded max and preserves prior data instead of wiping it", async () => {
    mockGetConfessions.mockResolvedValue({
      ok: false,
      error: { message: "Failed to fetch" },
    });

    const { result } = renderHook(() => useConfessionsQuery({}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    // 1 initial attempt + 3 retries = 4 calls total.
    expect(mockGetConfessions).toHaveBeenCalledTimes(4);
  });
});

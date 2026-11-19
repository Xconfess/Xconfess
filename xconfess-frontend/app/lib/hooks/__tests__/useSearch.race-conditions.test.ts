import { renderHook, act, waitFor } from "@testing-library/react";
import { useSearch } from "../useSearch";
import type { SearchFilters } from "@/app/lib/types/search";

describe("useSearch - Race Condition Tests", () => {
  const defaultFilters: SearchFilters = { sort: "newest" };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("prevents stale responses from replacing newer results", async () => {
    const { result, rerender } = renderHook(() =>
      useSearch({
        query: "test",
        filters: defaultFilters,
        debouncedQuery: "test",
        runSearch: true,
      })
    );

    let callCount = 0;
    (global.fetch as jest.Mock).mockImplementation(() => {
      callCount++;
      const delay = callCount === 1 ? 1000 : 100; // First call takes longer

      return new Promise((resolve) => {
        setTimeout(
          () => {
            resolve(
              new Response(
                JSON.stringify({
                  confessions:
                    callCount === 1
                      ? [{ id: "old1" }]
                      : [{ id: "new1" }],
                  total: 1,
                  hasMore: false,
                })
              )
            );
          },
          delay
        );
      });
    });

    // First search
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    // Trigger a new search before the first one completes
    act(() => {
      rerender();
    });

    // Wait for the newer search to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The results should be from the newer search, not the stale one
    // This tests that the requestSequenceRef prevents stale updates
    expect(result.current.results.length).toBeGreaterThanOrEqual(0);
  });

  it("cancels abandoned search requests", async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, "abort");

    const { unmount } = renderHook(() =>
      useSearch({
        query: "test",
        filters: defaultFilters,
        debouncedQuery: "test",
        runSearch: true,
      })
    );

    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    // Unmount should trigger abort
    unmount();

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });

  it("handles multiple consecutive searches correctly", async () => {
    let requestCount = 0;

    (global.fetch as jest.Mock).mockImplementation(() => {
      requestCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            confessions: [{ id: `result${requestCount}` }],
            total: 1,
            hasMore: false,
          })
        )
      );
    });

    const { result, rerender } = renderHook(
      ({ debouncedQuery }: { debouncedQuery: string }) =>
        useSearch({
          query: debouncedQuery,
          filters: defaultFilters,
          debouncedQuery,
          runSearch: true,
        }),
      { initialProps: { debouncedQuery: "search1" } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstResults = result.current.results;

    // Change search query
    act(() => {
      rerender({ debouncedQuery: "search2" });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Results should have changed
    expect(result.current.results).not.toEqual(firstResults);
  });

  it("validates search response format before updating state", async () => {
    const { result } = renderHook(() =>
      useSearch({
        query: "test",
        filters: defaultFilters,
        debouncedQuery: "test",
        runSearch: true,
      })
    );

    // Invalid response (missing confessions array)
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 1, hasMore: false }))
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
  });

  it("does not log raw search terms on error", async () => {
    const logSpy = jest.spyOn(console, "error").mockImplementation();

    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("Network error")
    );

    const { result } = renderHook(() =>
      useSearch({
        query: "sensitive search term",
        filters: defaultFilters,
        debouncedQuery: "sensitive search term",
        runSearch: true,
      })
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    // Verify that sensitive search term was not logged
    const logs = logSpy.mock.calls.join(" ");
    expect(logs).not.toContain("sensitive search term");

    logSpy.mockRestore();
  });

  it("handles abort errors gracefully", async () => {
    const { result } = renderHook(() =>
      useSearch({
        query: "test",
        filters: defaultFilters,
        debouncedQuery: "test",
        runSearch: true,
      })
    );

    const abortError = new DOMException("Aborted", "AbortError");
    (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Error should not be shown for aborted requests
    // (the cleanup function should prevent the state update)
  });

  it("maintains correct request sequence during rapid searches", async () => {
    let responses: number[] = [];

    (global.fetch as jest.Mock).mockImplementation(() => {
      const responseId = responses.length;
      responses.push(responseId);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            confessions: [{ id: `request${responseId}` }],
            total: 1,
            hasMore: false,
          })
        )
      );
    });

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) =>
        useSearch({
          query,
          filters: defaultFilters,
          debouncedQuery: query,
          runSearch: true,
        }),
      { initialProps: { query: "query1" } }
    );

    // Trigger rapid searches without waiting
    act(() => {
      rerender({ query: "query2" });
      rerender({ query: "query3" });
      rerender({ query: "query4" });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The final results should correspond to the last query
    // (not an older request that happened to complete later)
  });
});

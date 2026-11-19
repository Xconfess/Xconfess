import { act, renderHook, waitFor } from "@testing-library/react";
import { useSearch } from "../useSearch";
import { DEFAULT_FILTERS } from "../../types/search";

function response(id: string): Response {
  return { ok: true, json: async () => ({ confessions: [{ id }], total: 1, hasMore: false }) } as Response;
}

describe("useSearch request ordering", () => {
  it("ignores an older response that resolves after the newest query", async () => {
    const pending = new Map<string, (value: Response) => void>();
    global.fetch = jest.fn((url: string | URL | Request) => new Promise<Response>((resolve) => {
      pending.set(String(url), resolve);
    })) as jest.Mock;

    const { result, rerender } = renderHook(
      ({ query }) => useSearch({
        query,
        debouncedQuery: query,
        filters: DEFAULT_FILTERS,
        runSearch: true,
      }),
      { initialProps: { query: "old" } },
    );

    await waitFor(() => expect(pending.size).toBe(1));
    rerender({ query: "new" });
    await waitFor(() => expect(pending.size).toBe(2));

    await act(async () => pending.get("/api/confessions/search?page=1&limit=10&q=new")?.(response("new")));
    await waitFor(() => expect(result.current.results[0]?.id).toBe("new"));
    await act(async () => pending.get("/api/confessions/search?page=1&limit=10&q=old")?.(response("old")));

    expect(result.current.results[0]?.id).toBe("new");
  });

  it("restores pagination when browser history changes the URL page", async () => {
    global.fetch = jest.fn(async () => response("result")) as jest.Mock;
    const { result, rerender } = renderHook(
      ({ initialPage }) => useSearch({
        query: "history",
        debouncedQuery: "history",
        filters: DEFAULT_FILTERS,
        runSearch: true,
        initialPage,
      }),
      { initialProps: { initialPage: 1 } },
    );

    await waitFor(() => expect(result.current.page).toBe(1));
    rerender({ initialPage: 3 });

    await waitFor(() => expect(result.current.page).toBe(3));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/confessions/search?page=3&limit=10&q=history",
      expect.any(Object),
    ));
  });
});

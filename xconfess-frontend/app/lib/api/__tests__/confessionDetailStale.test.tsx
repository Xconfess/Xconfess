import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { getConfessionById } from "@/app/lib/api/confessions";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { shouldRetryRead } from "@/app/lib/api/readRetry";

// Same query wiring as ConfessionDetailClient: keyed by id, signal forwarded.
function Detail({ id }: { id: string }) {
  const { data, isError } = useQuery({
    queryKey: queryKeys.confessions.detail(id),
    queryFn: async ({ signal }) => {
      const result = await getConfessionById(id, signal);
      if (!result.ok) throw new Error("NETWORK_FAILURE");
      return result.data;
    },
    retry: shouldRetryRead,
    retryDelay: 0,
  });
  if (isError) return <p>error</p>;
  return <p>{data ? data.content : "loading"}</p>;
}

function jsonResponse(id: string) {
  return new Response(JSON.stringify({ id, message: `content ${id}` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient();
  const utils = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return {
    ...utils,
    rerender: (next: React.ReactElement) =>
      utils.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>),
  };
}

describe("confession detail requests", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("ignores a slow stale response after navigating to another confession", async () => {
    const pending: Record<string, { resolve: (r: Response) => void; signal?: AbortSignal }> = {};
    global.fetch = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const id = String(url).split("/").pop()!;
      return new Promise<Response>((resolve) => {
        pending[id] = { resolve, signal: init?.signal ?? undefined };
      });
    }) as typeof fetch;

    const { rerender } = renderWithClient(<Detail id="a" />);
    await waitFor(() => expect(pending.a).toBeDefined());

    rerender(<Detail id="b" />);
    await waitFor(() => expect(pending.b).toBeDefined());

    // Out of order: b resolves first, then the stale a.
    pending.b.resolve(jsonResponse("b"));
    await screen.findByText("content b");
    pending.a.resolve(jsonResponse("a"));

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("content b")).toBeTruthy();
    expect(screen.queryByText("content a")).toBeNull();
    expect(pending.a.signal?.aborted).toBe(true);
  });

  it("recovers after a transient offline failure", async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return jsonResponse("c");
    }) as typeof fetch;

    renderWithClient(<Detail id="c" />);
    await screen.findByText("content c");
    expect(calls).toBe(2);
  });
});

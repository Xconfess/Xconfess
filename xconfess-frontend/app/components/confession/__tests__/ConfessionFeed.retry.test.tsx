/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ConfessionFeed } from "../ConfessionFeed";
import { useInfiniteConfessions } from "../../../lib/hooks/useConfessionsQuery";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => "/confessions",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("../../../lib/hooks/useScrollRestoration", () => ({
  useScrollRestoration: jest.fn(),
}));

jest.mock("../../../lib/hooks/useConfessionsQuery", () => ({
  useInfiniteConfessions: jest.fn(),
}));

jest.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 300,
        size: 300,
      })),
    getTotalSize: () => count * 300,
    measureElement: jest.fn(),
  }),
}));

jest.mock("../ConfessionCard", () => ({
  ConfessionCard: ({ confession }: any) => (
    <div data-testid="confession-card">{confession.content}</div>
  ),
}));

jest.mock("../LoadingSkeleton", () => ({
  ConfessionFeedSkeleton: () => (
    <div data-testid="loading-skeleton">Loading...</div>
  ),
}));

const mockUseInfiniteConfessions =
  useInfiniteConfessions as jest.MockedFunction<typeof useInfiniteConfessions>;

const CONFESSIONS = [
  { id: "1", content: "Confession 1" },
  { id: "2", content: "Confession 2" },
];

function mockFeedState(overrides: Record<string, unknown> = {}) {
  mockUseInfiniteConfessions.mockReturnValue({
    data: {
      pages: [{ confessions: CONFESSIONS }],
    },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    isPlaceholderData: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    error: null,
    refetch: jest.fn(),
    ...overrides,
  } as ReturnType<typeof useInfiniteConfessions>);
}

/** A promise that never settles, so an in-flight request can be observed. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = () => res();
  });
  return { promise, resolve };
}

describe("ConfessionFeed — loading, empty and error states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeedState();
  });

  it("shows the loading skeleton and no error or empty state while loading", () => {
    mockFeedState({ data: undefined, isLoading: true });

    render(<ConfessionFeed />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("No confessions yet.")).not.toBeInTheDocument();
  });

  it("shows the empty state when the feed loaded successfully with no confessions", () => {
    mockFeedState({ data: { pages: [{ confessions: [] }] } });

    render(<ConfessionFeed />);

    expect(screen.getByText("No confessions yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("feed-refresh-notice")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the full error state when the very first load fails", () => {
    mockFeedState({
      data: undefined,
      error: new Error("Network Error"),
    });

    render(<ConfessionFeed />);

    expect(screen.getByText("Unable to load feed")).toBeInTheDocument();
    expect(screen.getByText("Network Error")).toBeInTheDocument();
    expect(screen.queryByTestId("feed-refresh-notice")).not.toBeInTheDocument();
    expect(screen.queryByText("No confessions yet.")).not.toBeInTheDocument();
  });

  it("keeps the loaded confessions visible and reports the failure inline when a refresh fails", () => {
    mockFeedState({
      error: new Error("Gateway Timeout"),
    });

    render(<ConfessionFeed />);

    const notice = screen.getByTestId("feed-refresh-notice");
    expect(notice).toBeInTheDocument();
    expect(screen.getByText("Gateway Timeout")).toBeInTheDocument();

    // The feed content the user was reading is not thrown away.
    expect(screen.getAllByTestId("confession-card")).toHaveLength(2);
    expect(screen.queryByText("Unable to load feed")).not.toBeInTheDocument();
  });
});

describe("ConfessionFeed — retry controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeedState();
  });

  it("retries through refetch from the initial error state", async () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockFeedState({ data: undefined, error: new Error("Network Error"), refetch });

    render(<ConfessionFeed />);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("retries through refetch from the inline refresh notice", async () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockFeedState({ error: new Error("Gateway Timeout"), refetch });

    render(<ConfessionFeed />);

    fireEvent.click(
      screen.getByRole("button", { name: /^retry$/i }),
    );

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("does not start a second request when the retry button is clicked twice in a row", async () => {
    const { promise } = deferred();
    const refetch = jest.fn().mockReturnValue(promise);
    mockFeedState({ data: undefined, error: new Error("Network Error"), refetch });

    render(<ConfessionFeed />);

    const retryButton = screen.getByRole("button", { name: /retry/i });

    // Both clicks land before React can flush the disabled state, which is
    // exactly the situation the in-flight guard has to cover.
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));

    fireEvent.click(retryButton);
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("does not start a second request when the inline refresh retry is clicked twice in a row", async () => {
    const { promise } = deferred();
    const refetch = jest.fn().mockReturnValue(promise);
    mockFeedState({ error: new Error("Gateway Timeout"), refetch });

    render(<ConfessionFeed />);

    const retryButton = screen.getByRole("button", { name: /^retry$/i });

    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("shows the retry as in flight while the request is pending", async () => {
    const { promise } = deferred();
    const refetch = jest.fn().mockReturnValue(promise);
    mockFeedState({ error: new Error("Gateway Timeout"), refetch });

    render(<ConfessionFeed />);

    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    const retrying = await screen.findByRole("button", { name: /retrying/i });
    expect(retrying).toBeDisabled();
    expect(retrying).toHaveAttribute("aria-busy", "true");
  });

  it("allows another retry once the previous request has settled", async () => {
    const refetch = jest.fn().mockResolvedValue({});
    mockFeedState({ error: new Error("Gateway Timeout"), refetch });

    render(<ConfessionFeed />);

    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));

    const retryButton = await screen.findByRole("button", { name: /^retry$/i });
    expect(retryButton).not.toBeDisabled();

    fireEvent.click(retryButton);
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
  });
});

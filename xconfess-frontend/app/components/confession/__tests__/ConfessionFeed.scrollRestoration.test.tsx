/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
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

describe("ConfessionFeed — scroll anchors", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseInfiniteConfessions.mockReturnValue({
      data: {
        pages: [
          {
            confessions: [
              { id: "confession-1", content: "First" },
              { id: "confession-2", content: "Second" },
            ],
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      error: null,
      refetch: jest.fn(),
    } as ReturnType<typeof useInfiniteConfessions>);
  });

  it("marks every confession as a scroll anchor so the position survives a refresh", () => {
    render(<ConfessionFeed />);

    const anchors = document.querySelectorAll("[data-scroll-anchor]");
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toHaveAttribute("data-scroll-anchor", "confession-1");
    expect(anchors[1]).toHaveAttribute("data-scroll-anchor", "confession-2");
  });

  it("restores the scroll position only once the feed content is ready", () => {
    const { useScrollRestoration } = jest.requireMock(
      "../../../lib/hooks/useScrollRestoration",
    );

    mockUseInfiniteConfessions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      error: null,
      refetch: jest.fn(),
    } as ReturnType<typeof useInfiniteConfessions>);

    render(<ConfessionFeed />);

    expect(useScrollRestoration).toHaveBeenCalledWith("/confessions", {
      contentReady: false,
    });
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });
});

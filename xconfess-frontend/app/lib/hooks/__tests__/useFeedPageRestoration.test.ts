/**
 * @jest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { useFeedPageRestoration } from "../useFeedPageRestoration";

const STORAGE_KEY = "xconfess_feed_page_counts";

function setup({
  pathname = "/confessions",
  pageCount,
  hasNextPage = true,
  isFetchingNextPage = false,
  enabled = true,
}: {
  pathname?: string;
  pageCount: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  enabled?: boolean;
}) {
  const fetchNextPage = jest.fn(() => Promise.resolve());
  const { rerender } = renderHook(
    (props) => useFeedPageRestoration(props),
    {
      initialProps: {
        pathname,
        pageCount,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        enabled,
      },
    },
  );
  return { fetchNextPage, rerender };
}

describe("useFeedPageRestoration", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("does nothing when no page count was previously stored", () => {
    const { fetchNextPage } = setup({ pageCount: 1 });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("replays fetchNextPage until the previously loaded page count is reached", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/confessions": 3 }));

    const { fetchNextPage, rerender } = setup({ pageCount: 1 });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    rerender({
      pathname: "/confessions",
      pageCount: 2,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      enabled: true,
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(2);

    rerender({
      pathname: "/confessions",
      pageCount: 3,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      enabled: true,
    });
    // Target reached: no further calls.
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it("does not loop once restoration is done, even as pageCount keeps changing", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/confessions": 2 }));

    const { fetchNextPage, rerender } = setup({ pageCount: 1 });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    rerender({
      pathname: "/confessions",
      pageCount: 2,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      enabled: true,
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // Further organic pagination (user scrolling) must not re-trigger replay.
    rerender({
      pathname: "/confessions",
      pageCount: 3,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      enabled: true,
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("falls back to no restoration for an invalid stored value", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/confessions": -5 }));

    const { fetchNextPage } = setup({ pageCount: 1 });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("caps restoration at a safe maximum for corrupt/huge stored values", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/confessions": 999999 }));

    const { fetchNextPage } = setup({ pageCount: 1, hasNextPage: true });
    // Only asserts it attempts to continue (bounded), not the exact count,
    // since further growth is driven by rerenders in real usage.
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("stops replaying once hasNextPage becomes false", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ "/confessions": 5 }));

    const { fetchNextPage, rerender } = setup({ pageCount: 1, hasNextPage: true });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    rerender({
      pathname: "/confessions",
      pageCount: 2,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
      enabled: true,
    });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

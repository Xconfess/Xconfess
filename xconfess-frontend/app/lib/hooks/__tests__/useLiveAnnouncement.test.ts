/**
 * @jest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { useLiveAnnouncement } from "../useLiveAnnouncement";

describe("useLiveAnnouncement", () => {
  it("announces loading", () => {
    const { result } = renderHook(() =>
      useLiveAnnouncement({
        isLoading: true,
        isFetching: true,
        isFetchingNextPage: false,
        isError: false,
      }),
    );
    expect(result.current).toBe("Loading feed...");
  });

  it("announces a background refresh completing", () => {
    const { result, rerender } = renderHook(
      (props) => useLiveAnnouncement(props),
      {
        initialProps: {
          isLoading: false,
          isFetching: true,
          isFetchingNextPage: false,
          isError: false,
        },
      },
    );
    expect(result.current).toBe("Updating feed contents...");

    rerender({
      isLoading: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
    });
    expect(result.current).toBe("Feed updated.");
  });

  it("announces an error", () => {
    const { result } = renderHook(() =>
      useLiveAnnouncement({
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isError: true,
        errorMessage: "Network Error",
      }),
    );
    expect(result.current).toBe("Unable to load feed: Network Error");
  });

  it("dedupes identical consecutive messages", () => {
    const { result, rerender } = renderHook(
      (props) => useLiveAnnouncement(props),
      {
        initialProps: {
          isLoading: false,
          isFetching: true,
          isFetchingNextPage: false,
          isError: false,
        },
      },
    );
    expect(result.current).toBe("Updating feed contents...");

    rerender({
      isLoading: false,
      isFetching: true,
      isFetchingNextPage: false,
      isError: false,
    });
    // Same message stays referentially the "current" value, not re-fired
    // as a fresh announcement.
    expect(result.current).toBe("Updating feed contents...");
  });
});

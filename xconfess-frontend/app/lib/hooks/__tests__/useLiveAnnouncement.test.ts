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

  it("announces the number of results after a background refresh", () => {
    const { result, rerender } = renderHook(
      (props) => useLiveAnnouncement(props),
      {
        initialProps: {
          isLoading: false,
          isFetching: true,
          isFetchingNextPage: false,
          isError: false,
          resultCount: 2,
        },
      },
    );
    expect(result.current).toBe("Updating feed contents...");

    rerender({
      isLoading: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      resultCount: 2,
    });
    expect(result.current).toBe("2 confessions available.");
  });

  it("announces an empty result count without reading post content", () => {
    const { result, rerender } = renderHook(
      (props) => useLiveAnnouncement(props),
      {
        initialProps: {
          isLoading: true,
          isFetching: true,
          isFetchingNextPage: false,
          isError: false,
          resultCount: 0,
        },
      },
    );

    rerender({
      isLoading: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      resultCount: 0,
    });
    expect(result.current).toBe("No confessions found.");
    expect(result.current).not.toContain("confession text");
  });

  it("announces a safe generic failure and never echoes backend error text", () => {
    const { result } = renderHook(() =>
      useLiveAnnouncement({
        isLoading: false,
        isFetching: false,
        isFetchingNextPage: false,
        isError: true,
      }),
    );
    expect(result.current).toBe("Unable to load feed.");
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
    expect(result.current).toBe("Updating feed contents...");
  });
});

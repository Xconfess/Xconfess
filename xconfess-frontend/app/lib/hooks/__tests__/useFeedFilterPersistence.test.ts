/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import {
  useFeedFilterPersistence,
  __TESTING,
} from "../useFeedFilterPersistence";

const SORTS = ["newest", "trending", "most_discussed"] as const;

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("useFeedFilterPersistence", () => {
  it("returns null when nothing has been stored yet", () => {
    const { result } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );

    expect(result.current.read()).toBeNull();
  });

  it("stores an allowed value and reads it back", () => {
    const { result } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );

    act(() => {
      result.current.write("trending");
    });

    expect(result.current.read()).toBe("trending");
    const raw = window.sessionStorage.getItem(__TESTING.STORAGE_KEY);
    expect(raw && JSON.parse(raw)).toEqual({ sort: "trending" });
  });

  it("rejects a value that is not in the allowed list", () => {
    const { result } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );

    act(() => {
      // @ts-expect-error — deliberately passing an invalid value
      result.current.write("hacked");
    });

    expect(result.current.read()).toBeNull();
    expect(window.sessionStorage.getItem(__TESTING.STORAGE_KEY)).toBeNull();
  });

  it("treats a persisted value from an older build as absent when it is no longer allowed", () => {
    window.sessionStorage.setItem(
      __TESTING.STORAGE_KEY,
      JSON.stringify({ sort: "retired_tab" }),
    );

    const { result } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );

    expect(result.current.read()).toBeNull();
  });

  it("ignores non-object JSON left behind by another app", () => {
    window.sessionStorage.setItem(__TESTING.STORAGE_KEY, "[]");
    const { result: arrResult } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );
    expect(arrResult.current.read()).toBeNull();

    window.sessionStorage.setItem(__TESTING.STORAGE_KEY, "not-json");
    const { result: stringResult } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );
    expect(stringResult.current.read()).toBeNull();
  });

  it("refuses to persist against an unknown filter key", () => {
    const { result } = renderHook(() =>
      useFeedFilterPersistence("unknown_filter", SORTS),
    );

    act(() => {
      result.current.write("trending");
    });

    expect(result.current.read()).toBeNull();
    expect(window.sessionStorage.getItem(__TESTING.STORAGE_KEY)).toBeNull();
  });

  it("clears the stored value", () => {
    const { result } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );

    act(() => {
      result.current.write("newest");
      result.current.clear();
    });

    expect(result.current.read()).toBeNull();
  });

  it("survives a sessionStorage write failure without throwing", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = jest.fn(() => {
      throw new Error("QuotaExceededError");
    });

    const { result } = renderHook(() =>
      useFeedFilterPersistence("sort", SORTS),
    );

    expect(() => {
      act(() => result.current.write("trending"));
    }).not.toThrow();

    Storage.prototype.setItem = original;
  });
});

/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

type Listener = (event: MediaQueryListEvent) => void;

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  addListener: jest.Mock;
  removeListener: jest.Mock;
  dispatchEvent: jest.Mock;
  __fire: (matches: boolean) => void;
}

function installMatchMedia(initial: boolean): MockMediaQueryList {
  const listeners = new Set<Listener>();
  const mql: MockMediaQueryList = {
    matches: initial,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: jest.fn((_event: string, listener: Listener) => {
      listeners.add(listener);
    }),
    removeEventListener: jest.fn((_event: string, listener: Listener) => {
      listeners.delete(listener);
    }),
    addListener: jest.fn((listener: Listener) => {
      listeners.add(listener);
    }),
    removeListener: jest.fn((listener: Listener) => {
      listeners.delete(listener);
    }),
    dispatchEvent: jest.fn(),
    __fire(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((l) =>
        l({ matches, media: mql.media } as MediaQueryListEvent),
      );
    },
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: jest.fn(() => mql),
  });

  return mql;
}

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    // @ts-expect-error — cleanup for the installed stub
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it("returns false when the user has not asked to reduce motion", () => {
    installMatchMedia(false);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(false);
  });

  it("returns true when the OS reports a reduce-motion preference", () => {
    installMatchMedia(true);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(true);
  });

  it("updates when the preference changes at runtime", () => {
    const mql = installMatchMedia(false);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(false);

    act(() => {
      mql.__fire(true);
    });

    expect(result.current).toBe(true);

    act(() => {
      mql.__fire(false);
    });

    expect(result.current).toBe(false);
  });

  it("removes the media-query listener on unmount", () => {
    const mql = installMatchMedia(false);

    const { unmount } = renderHook(() => usePrefersReducedMotion());
    unmount();

    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});

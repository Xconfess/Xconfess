/**
 * @jest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { useScrollRestoration } from "../useScrollRestoration";

describe("useScrollRestoration", () => {
  let frames: FrameRequestCallback[];
  // Simulates a page whose content grows as cached feed pages render:
  // scrollTo clamps to the current max scroll height.
  let maxScroll: number;

  const runFrame = () => frames.shift()?.(0);

  beforeEach(() => {
    frames = [];
    maxScroll = 0;
    sessionStorage.setItem(
      "xconfess_scroll_positions",
      JSON.stringify({ "/confessions": 2400 }),
    );
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => frames.push(cb));
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    window.scrollTo = jest.fn((_x: number, y: number) => {
      Object.defineProperty(window, "scrollY", {
        value: Math.min(y, maxScroll),
        configurable: true,
      });
    }) as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    sessionStorage.clear();
  });

  it("keeps retrying until the page is tall enough to reach the saved position", () => {
    renderHook(() => useScrollRestoration("/confessions"));

    runFrame(); // content not rendered yet
    expect(window.scrollY).toBe(0);
    expect(frames).toHaveLength(1);

    maxScroll = 1200;
    runFrame(); // partially rendered
    expect(window.scrollY).toBe(1200);

    maxScroll = 5000;
    runFrame(); // fully rendered: lands and stops
    expect(window.scrollY).toBe(2400);
    expect(frames).toHaveLength(0);
  });

  it("stops restoring once the user scrolls", () => {
    renderHook(() => useScrollRestoration("/confessions"));

    runFrame();
    window.dispatchEvent(new Event("wheel"));

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("gives up after about a second if the position is never reachable", () => {
    renderHook(() => useScrollRestoration("/confessions"));

    for (let i = 0; i < 100 && frames.length; i++) runFrame();

    expect(window.scrollTo).toHaveBeenCalledTimes(60);
    expect(frames).toHaveLength(0);
  });
});

/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { useScrollRestoration } from "../useScrollRestoration";
import { SCROLL_POSITION_STORAGE_KEY } from "@/app/lib/utils/scrollPositions";

const CARD_HEIGHT = 300;

let frames: FrameRequestCallback[];
let scrollY: number;
let maxScroll: number;
let layout: Map<string, number>;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

function makeRect(top: number) {
  return {
    top,
    bottom: top + CARD_HEIGHT,
    left: 0,
    right: 0,
    width: 0,
    height: CARD_HEIGHT,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Renders a list of anchored items and keeps their document offsets in sync
 * with the mocked scroll position.
 */
function renderAnchoredItems(ids: string[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const elements = ids.map((id) => {
    const element = document.createElement("div");
    element.setAttribute("data-scroll-anchor", id);
    element.getBoundingClientRect = () => {
      const documentTop = layout.get(id) ?? 0;
      return makeRect(documentTop - scrollY);
    };
    container.appendChild(element);
    return element;
  });

  return { container, elements };
}

function runFrame() {
  frames.shift()?.(0);
}

function readStoredPositions(): Record<string, { y: number; anchor?: { id: string; offset: number } | null }> {
  const raw = sessionStorage.getItem(SCROLL_POSITION_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

beforeEach(() => {
  frames = [];
  scrollY = 0;
  maxScroll = 100000;
  layout = new Map();

  jest.useFakeTimers();

  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb) => frames.push(cb));
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  window.scrollTo = jest.fn((_x: number, y: number) => {
    scrollY = Math.min(y, maxScroll);
  }) as unknown as typeof window.scrollTo;
  Object.defineProperty(window, "scrollY", {
    get: () => scrollY,
    configurable: true,
  });

  sessionStorage.clear();
  document.body.innerHTML = "";
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  sessionStorage.clear();
});

describe("useScrollRestoration — anchored positions", () => {
  it("saves the confession at the top of the viewport next to the offset", async () => {
    layout = new Map([
      ["a", 0],
      ["b", CARD_HEIGHT],
      ["c", CARD_HEIGHT * 2],
    ]);
    renderAnchoredItems(["a", "b", "c"]);

    scrollY = 350;
    renderHook(() => useScrollRestoration("/confessions"));

    act(() => {
      window.dispatchEvent(new Event("scroll"));
      jest.advanceTimersByTime(300);
    });

    const stored = readStoredPositions();
    expect(stored["/confessions"].y).toBe(350);
    expect(stored["/confessions"].anchor).toEqual({ id: "b", offset: -50 });
  });

  it("restores the anchored confession when the feed was refreshed while away", () => {
    // The user was looking at confession "b" ...
    layout = new Map([
      ["a", 0],
      ["b", CARD_HEIGHT],
      ["c", CARD_HEIGHT * 2],
    ]);
    renderAnchoredItems(["a", "b", "c"]);

    scrollY = 350;
    sessionStorage.setItem(
      SCROLL_POSITION_STORAGE_KEY,
      JSON.stringify({
        "/confessions": { y: 350, anchor: { id: "b", offset: -50 } },
      }),
    );

    // ... and while they were away a new confession was published, pushing
    // everything down by one card.
    layout = new Map([
      ["new", 0],
      ["a", CARD_HEIGHT],
      ["b", CARD_HEIGHT * 2],
      ["c", CARD_HEIGHT * 3],
    ]);
    renderAnchoredItems(["new", "a", "b", "c"]);

    renderHook(() => useScrollRestoration("/confessions"));

    act(() => {
      runFrame();
    });

    // "b" is back at the same place in the viewport (-50px below the top)
    // instead of the feed jumping to the raw pixel offset.
    expect(scrollY).toBe(CARD_HEIGHT * 2 + 50);
    expect(frames).toHaveLength(0);
  });

  it("falls back to the saved offset when the anchored confession is gone", () => {
    sessionStorage.setItem(
      SCROLL_POSITION_STORAGE_KEY,
      JSON.stringify({
        "/confessions": { y: 1200, anchor: { id: "removed", offset: -80 } },
      }),
    );

    renderHook(() => useScrollRestoration("/confessions"));

    act(() => {
      runFrame();
    });

    expect(scrollY).toBe(1200);
  });

  it("restores on a desktop viewport", () => {
    setViewport(1440, 900);
    layout = new Map([
      ["a", 0],
      ["b", CARD_HEIGHT],
      ["c", CARD_HEIGHT * 2],
    ]);
    renderAnchoredItems(["a", "b", "c"]);

    sessionStorage.setItem(
      SCROLL_POSITION_STORAGE_KEY,
      JSON.stringify({
        "/confessions": { y: 350, anchor: { id: "b", offset: -50 } },
      }),
    );

    renderHook(() => useScrollRestoration("/confessions"));

    act(() => {
      runFrame();
    });

    expect(scrollY).toBe(CARD_HEIGHT + 50);
  });

  it("clamps to the reachable position on a mobile viewport that cannot scroll that far", () => {
    setViewport(390, 844);
    // A short page: the browser cannot scroll all the way to the saved offset.
    maxScroll = 400;

    sessionStorage.setItem(
      SCROLL_POSITION_STORAGE_KEY,
      JSON.stringify({ "/confessions": { y: 2400 } }),
    );

    renderHook(() => useScrollRestoration("/confessions"));

    act(() => {
      runFrame();
    });

    expect(scrollY).toBe(400);
  });

  it("waits for the content before restoring a position", () => {
    sessionStorage.setItem(
      SCROLL_POSITION_STORAGE_KEY,
      JSON.stringify({ "/confessions": { y: 1200 } }),
    );

    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        useScrollRestoration("/confessions", { contentReady: ready }),
      { initialProps: { ready: false } },
    );

    act(() => {
      runFrame();
    });

    expect(scrollY).toBe(0);
    expect(window.scrollTo).not.toHaveBeenCalled();

    rerender({ ready: true });

    act(() => {
      runFrame();
    });

    expect(scrollY).toBe(1200);
  });
});

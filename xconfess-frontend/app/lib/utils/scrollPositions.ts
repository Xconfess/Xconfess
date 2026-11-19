/**
 * Shared helpers for remembering where the user was in a scrollable list.
 *
 * Positions are stored per pathname in `sessionStorage`, so they survive
 * client-side navigations (feed -> confession detail -> back) and reloads
 * within the same browser tab session.
 *
 * Two things are stored for every position:
 *
 *  - `y`: the raw window scroll offset.
 *  - `anchor`: the id of the first list item visible at the top of the
 *    viewport, plus the distance between that item and the top of the
 *    viewport.
 *
 * The anchor is what makes restoration survive refreshed data. When new
 * confessions are published while the user is away, every item below the
 * insertion point shifts down and the raw pixel offset would land on a
 * completely different confession. When the anchored item is still present
 * we scroll to the item itself; when it is gone we fall back to the raw
 * offset so the user still lands somewhere sensible.
 */

export const SCROLL_POSITION_STORAGE_KEY = "xconfess_scroll_positions";

/** Attribute used to mark list items that can act as a scroll anchor. */
export const SCROLL_ANCHOR_ATTRIBUTE = "data-scroll-anchor";

export interface ScrollAnchor {
  /** Value of the `data-scroll-anchor` attribute. */
  id: string;
  /** Distance between the top of the item and the top of the viewport. */
  offset: number;
}

export interface ScrollPosition {
  /** Window scroll offset. */
  y: number;
  /** Optional item that was at the top of the viewport. */
  anchor?: ScrollAnchor | null;
}

export type ScrollPositionMap = Record<string, ScrollPosition>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Reads every stored scroll position.
 *
 * Positions written by older builds were bare numbers; they are upgraded to
 * the current shape on read so a stale entry still restores the offset.
 */
export function readScrollPositions(): ScrollPositionMap {
  if (typeof sessionStorage === "undefined") return {};

  try {
    const raw = sessionStorage.getItem(SCROLL_POSITION_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const positions: ScrollPositionMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isFiniteNumber(value)) {
        positions[key] = { y: value };
        continue;
      }

      if (!value || typeof value !== "object") continue;

      const candidate = value as Partial<ScrollPosition>;
      if (!isFiniteNumber(candidate.y)) continue;

      const anchor =
        candidate.anchor &&
        typeof candidate.anchor.id === "string" &&
        isFiniteNumber(candidate.anchor.offset)
          ? { id: candidate.anchor.id, offset: candidate.anchor.offset }
          : null;

      positions[key] = { y: candidate.y, anchor };
    }

    return positions;
  } catch {
    return {};
  }
}

/** Persists every scroll position. */
export function writeScrollPositions(positions: ScrollPositionMap): void {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.setItem(
      SCROLL_POSITION_STORAGE_KEY,
      JSON.stringify(positions),
    );
  } catch {
    // Quota exceeded or storage disabled: silently ignore.
  }
}

/** Stores the position for a single pathname. */
export function writeScrollPosition(
  pathname: string,
  position: ScrollPosition,
): void {
  const positions = readScrollPositions();
  positions[pathname] = position;
  writeScrollPositions(positions);
}

/**
 * Finds the anchor element with the given id.
 *
 * The id is compared attribute by attribute instead of being interpolated
 * into a CSS selector, so ids containing quotes or brackets cannot break
 * the lookup.
 */
export function findAnchorElement(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const elements = document.querySelectorAll(`[${SCROLL_ANCHOR_ATTRIBUTE}]`);
  for (const element of elements) {
    if (element.getAttribute(SCROLL_ANCHOR_ATTRIBUTE) === id) {
      return element as HTMLElement;
    }
  }

  return null;
}

/**
 * Captures the item that is currently at the top of the viewport.
 *
 * The first anchored item whose bottom edge is still below the top of the
 * viewport is used, which is the item the user is actually looking at.
 */
export function captureScrollAnchor(): ScrollAnchor | null {
  if (typeof document === "undefined") return null;

  const elements = document.querySelectorAll(`[${SCROLL_ANCHOR_ATTRIBUTE}]`);
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= 0) continue;

    const id = element.getAttribute(SCROLL_ANCHOR_ATTRIBUTE);
    if (!id) continue;

    return { id, offset: rect.top };
  }

  return null;
}

/**
 * Works out where the page should be scrolled to in order to restore a
 * saved position.
 *
 * The anchor wins when it is still rendered, otherwise the raw offset is
 * used.
 */
export function resolveRestoreTarget(position: ScrollPosition): number {
  if (position.anchor) {
    const element = findAnchorElement(position.anchor.id);
    if (element) {
      const rect = element.getBoundingClientRect();
      return window.scrollY + rect.top - position.anchor.offset;
    }
  }

  return position.y;
}

/**
 * True when the page is already showing the saved position.
 *
 * When the anchored item is on screen it decides, because the pixel offset
 * alone cannot tell whether the right item is in view.
 */
export function isPositionRestored(position: ScrollPosition): boolean {
  if (position.anchor) {
    const element = findAnchorElement(position.anchor.id);
    if (element) {
      return (
        Math.abs(element.getBoundingClientRect().top - position.anchor.offset) <= 2
      );
    }
  }

  return Math.abs(window.scrollY - position.y) <= 2;
}

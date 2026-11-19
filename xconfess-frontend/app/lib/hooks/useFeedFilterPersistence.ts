"use client";

import { useCallback } from "react";

/**
 * Where a feed stashes its last-chosen filter so that navigating away and
 * coming back (or landing on a different feed surface) resumes the view the
 * user left off on. SessionStorage is chosen deliberately: it survives tab
 * switches and routed navigation within the same tab, but it clears when
 * the browser tab closes — a new session starts from the feed's default.
 */
const STORAGE_KEY = "xconfess.feed.filters";
const ALLOWED_KEYS = new Set<string>(["sort"]);

type FeedFilters = Record<string, string>;

function readAll(): FeedFilters {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: FeedFilters = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (ALLOWED_KEYS.has(k) && typeof v === "string") {
        out[k] = v;
      }
    }
    return out;
  } catch {
    // Quota, privacy mode, or a non-JSON value left by another app. Treat as
    // "no preference" and move on — this is purely a convenience store.
    return {};
  }
}

function writeAll(filters: FeedFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // SessionStorage can throw in private mode or when over quota. Dropping
    // the write is fine; the URL is still the source of truth.
  }
}

export interface FeedFilterPersistence<T extends string> {
  /**
   * Returns the persisted value for this filter key if it is one of the
   * allowed values, otherwise `null`. Call this when the URL does not
   * already pin a value — it must never override an explicit URL filter.
   */
  read: () => T | null;
  /** Persists the user's most recent choice for this filter key. */
  write: (value: T) => void;
  /** Drops the persisted value (e.g. when the filter is reset). */
  clear: () => void;
}

/**
 * Hook returning stable read/write helpers for one feed filter key.
 *
 * The caller passes the set of values that are valid for this filter key.
 * Anything persisted that is not in `allowedValues` is treated as absent,
 * so a stale value from an older build can never pin the feed to an
 * invalid combination.
 */
export function useFeedFilterPersistence<T extends string>(
  key: string,
  allowedValues: readonly T[],
): FeedFilterPersistence<T> {
  const allowed = allowedValues;

  const read = useCallback((): T | null => {
    if (!ALLOWED_KEYS.has(key)) return null;
    const stored = readAll()[key];
    if (typeof stored !== "string") return null;
    return (allowed as readonly string[]).includes(stored) ? (stored as T) : null;
  }, [key, allowed]);

  const write = useCallback(
    (value: T) => {
      if (!ALLOWED_KEYS.has(key)) return;
      if (!(allowed as readonly string[]).includes(value)) return;
      const current = readAll();
      current[key] = value;
      writeAll(current);
    },
    [key, allowed],
  );

  const clear = useCallback(() => {
    if (!ALLOWED_KEYS.has(key)) return;
    const current = readAll();
    if (!(key in current)) return;
    delete current[key];
    writeAll(current);
  }, [key]);

  return { read, write, clear };
}

export const __TESTING = { STORAGE_KEY, ALLOWED_KEYS };

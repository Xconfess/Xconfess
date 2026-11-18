"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "xconfess_feed_page_counts";
const MAX_RESTORABLE_PAGES = 20;

interface PageCounts {
  [path: string]: number;
}

function readPageCounts(): PageCounts {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePageCounts(counts: PageCounts) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // quota exceeded — silently ignore
  }
}

/**
 * `useInfiniteConfessions` always starts back at page 1 on remount, so
 * navigating away (e.g. into a confession detail) and back loses every page
 * loaded beyond the first before `useScrollRestoration` gets a chance to
 * scroll back down. This records how many pages were loaded per pathname and
 * replays that many `fetchNextPage()` calls once on mount so the content is
 * there for scroll restoration to land on.
 *
 * Guarded by a ref so the replay runs at most once per mount — `fetchNextPage`
 * resolving triggers new renders (pageCount growing) but must never
 * re-trigger the restoration pass itself, which would otherwise loop.
 */
export function useFeedPageRestoration({
  pathname,
  pageCount,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  enabled = true,
}: {
  pathname: string;
  pageCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  enabled?: boolean;
}) {
  const restorationRef = useRef<"idle" | "restoring" | "done">("idle");
  const targetRef = useRef(0);

  // Record how many pages are loaded, but only once restoration (if any) has
  // finished — otherwise the in-progress replay would overwrite the stored
  // count with intermediate values.
  useEffect(() => {
    if (!enabled) return;
    if (restorationRef.current === "restoring") return;
    if (pageCount <= 0) return;

    const counts = readPageCounts();
    if (counts[pathname] !== pageCount) {
      counts[pathname] = pageCount;
      writePageCounts(counts);
    }
  }, [enabled, pathname, pageCount]);

  useEffect(() => {
    if (!enabled) return;
    if (restorationRef.current !== "idle") return;
    restorationRef.current = "restoring";

    const counts = readPageCounts();
    const stored = counts[pathname];
    const safeTarget =
      typeof stored === "number" && Number.isFinite(stored) && stored > 1
        ? Math.min(Math.floor(stored), MAX_RESTORABLE_PAGES)
        : 1;
    targetRef.current = safeTarget;

    if (safeTarget <= 1) {
      restorationRef.current = "done";
    }
    // Intentionally runs only on mount/pathname change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) return;
    if (restorationRef.current !== "restoring") return;
    if (isFetchingNextPage) return;

    if (pageCount >= targetRef.current || !hasNextPage) {
      restorationRef.current = "done";
      return;
    }

    void fetchNextPage();
  }, [enabled, pageCount, hasNextPage, isFetchingNextPage, fetchNextPage]);
}

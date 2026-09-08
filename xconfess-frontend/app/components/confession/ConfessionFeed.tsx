"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp } from "lucide-react";
import { ConfessionCard } from "./ConfessionCard";
import { ConfessionFeedSkeleton } from "./LoadingSkeleton";
import { useInfiniteConfessions } from "../../lib/hooks/useConfessionsQuery";
import ErrorState from "../common/ErrorState";

const ESTIMATED_CARD_HEIGHT = 300;
const SCROLL_THRESHOLD = 400;
const OVERSCAN = 3;
type FeedSort = "newest" | "trending" | "most_discussed";

const SORT_OPTIONS: Array<{ value: FeedSort; label: string }> = [
  { value: "newest", label: "Recent" },
  { value: "trending", label: "Popular" },
  { value: "most_discussed", label: "Most discussed" },
];

export const ConfessionFeed = () => {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sort, setSort] = useState<FeedSort>("newest");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteConfessions({ sort });

  const allConfessions = data?.pages.flatMap((page) => page.confessions) ?? [];
  const isEmpty = !isLoading && !error && allConfessions.length === 0;

  const virtualizer = useWindowVirtualizer({
    count: allConfessions.length,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: 0,
  });

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const scrollToComposer = useCallback(() => {
    document.getElementById("composer")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const sortControls = (
    <div
      className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-1.5"
      role="tablist"
      aria-label="Feed sort"
    >
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={sort === option.value}
          onClick={() => setSort(option.value)}
          className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors sm:text-sm ${
            sort === option.value
              ? "bg-[var(--primary)] text-white shadow-[0_8px_18px_-10px_rgba(120,33,213,0.9)]"
              : "text-[var(--secondary)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: `${SCROLL_THRESHOLD}px` },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (isLoading) {
    return <ConfessionFeedSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        error="The backend service is not responding yet."
        title="Unable to load feed"
        description="This can happen while the Render instance is waking or a new backend deploy is finishing."
        showRetry
        onRetry={handleRetry}
      />
    );
  }

  if (isEmpty) {
    return (
      <div className="space-y-4">
        {sortControls}
        <div
          className="luxury-panel rounded-2xl p-8 text-center"
          role="region"
          aria-label="Empty feed state"
        >
          <p className="mb-3 font-editorial text-3xl text-[var(--foreground)] sm:text-4xl">
            No confessions yet.
          </p>
          <p className="mx-auto mb-4 max-w-xl text-sm leading-7 text-[var(--secondary)]">
            Be the first to share.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={scrollToComposer}
              className="rounded-xl bg-[var(--brand-gradient)] px-5 py-2.5 text-sm font-medium text-white shadow-[0_18px_42px_-22px_rgba(0,0,0,0.85)] transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              Begin writing
            </button>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-2.5 text-sm font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative mx-auto w-full max-w-3xl py-2">
      <div className="mb-4">{sortControls}</div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isFetching && !isFetchingNextPage ? "Updating feed contents..." : ""}
      </div>

      <div
        className="relative w-full transition-opacity duration-200"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          opacity: isFetching && !isFetchingNextPage ? 0.7 : 1,
        }}
        role="feed"
        aria-label="Confessions feed"
      >
        {virtualItems.map((virtualItem) => {
          const confession = allConfessions[virtualItem.index];
          if (!confession) return null;

          return (
            <div
              key={confession.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="absolute inset-x-0 top-0 pb-5"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
              role="article"
              aria-posinset={virtualItem.index + 1}
              aria-setsize={allConfessions.length}
            >
              <ConfessionCard confession={confession} />
            </div>
          );
        })}
      </div>

      <div ref={loadMoreRef} className="flex justify-center py-6">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-sm text-[var(--secondary)]">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading more...
          </div>
        )}
        {!hasNextPage && allConfessions.length > 0 && (
          <p className="text-xs text-[var(--secondary)]">
            You&apos;ve reached the end of the feed
          </p>
        )}
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="fixed bottom-5 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg transition-all hover:-translate-y-1 hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:bottom-8 sm:right-8"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

    </div>
  );
};

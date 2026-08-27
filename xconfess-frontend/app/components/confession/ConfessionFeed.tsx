"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, Scale, X } from "lucide-react";
import { ConfessionCard } from "./ConfessionCard";
import { ConfessionFeedSkeleton } from "./LoadingSkeleton";
import { useInfiniteConfessions } from "../../lib/hooks/useConfessionsQuery";
import { useComparisonStore } from "../../lib/store/comparisonStore";
import ErrorState from "../common/ErrorState";

const ESTIMATED_CARD_HEIGHT = 300;
const SCROLL_THRESHOLD = 400;
const OVERSCAN = 3;

export const ConfessionFeed = () => {
  const router = useRouter();
  const { selectedIds, clearItems } = useComparisonStore();
  const [showScrollTop, setShowScrollTop] = useState(false);
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
  } = useInfiniteConfessions();

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

  const handleNavigateToComparison = () => {
    if (selectedIds.length > 1) {
      router.push(`/compare?ids=${selectedIds.join(",")}`);
    }
  };

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
        error={undefined}
        title="Unable to load feed"
        description="We couldn't load recent confessions. Please try again or check your connection."
        showRetry
        onRetry={handleRetry}
      />
    );
  }

  if (isEmpty) {
    return (
      <div
        className="luxury-panel rounded-[30px] p-8 text-center"
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
            className="rounded-full bg-[var(--brand-gradient)] px-5 py-2.5 text-sm font-medium text-white shadow-[0_18px_42px_-22px_rgba(91,46,255,0.58)] transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Begin writing
          </button>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-2.5 text-sm font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative mx-auto w-full max-w-3xl py-2">
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
          className="fixed bottom-8 right-8 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg transition-all hover:-translate-y-1 hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {selectedIds.length > 0 && (
        <aside
          className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-in items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl fade-in slide-in-from-bottom-4 duration-300"
          aria-label="Metrics comparison inspector"
        >
          <div className="flex items-center gap-3">
            <div
              className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-[var(--primary)]"
              aria-hidden="true"
            >
              <Scale className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                Compare
              </p>
              <p className="text-[11px] text-zinc-400" aria-live="polite">
                {selectedIds.length === 1
                  ? "Select one more"
                  : `${selectedIds.length} selected`}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={clearItems}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Clear selection queue"
              aria-label="Clear selection queue"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={selectedIds.length < 2}
              onClick={handleNavigateToComparison}
              className={`flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                selectedIds.length >= 2
                  ? "cursor-pointer bg-[var(--primary)] text-white shadow-md hover:brightness-105"
                  : "cursor-not-allowed border border-zinc-800/60 bg-zinc-900 text-zinc-600 opacity-60"
              }`}
              aria-label={
                selectedIds.length >= 2
                  ? `Compare ${selectedIds.length} selected confessions`
                  : "Compare selected confessions (requires at least 2)"
              }
            >
              <span>Compare</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};

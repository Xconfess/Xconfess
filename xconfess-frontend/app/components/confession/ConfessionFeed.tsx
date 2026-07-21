"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { Scale, ArrowRight, X, ArrowUp } from "lucide-react";
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

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteConfessions();

  const allConfessions = data?.pages.flatMap((page) => page.confessions) ?? [];
  const isEmpty = !isLoading && allConfessions.length === 0;
  const [showScrollTop, setShowScrollTop] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: allConfessions.length,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: 0,
  });

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: `${SCROLL_THRESHOLD}px` },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToComposer = () => {
    document.getElementById("composer")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleNavigateToComparison = () => {
    if (selectedIds.length > 0) {
      router.push(`/dashboard/compare?ids=${selectedIds.join(",")}`);
    }
  };

  const handleRetry = () => {
    void refetch();
  };

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
      <div className="luxury-panel rounded-[30px] p-8 text-center">
        <p className="mb-3 font-editorial text-3xl sm:text-4xl text-[var(--foreground)]">
          No confessions yet.
        </p>
        <p className="mb-4 max-w-xl mx-auto text-sm leading-7 text-[var(--secondary)]">
          Be the first to set the tone for the community — share something
          thoughtful, kind, and true. Your first post helps others
          understand what belongs here.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={scrollToComposer}
            className="rounded-full bg-[linear-gradient(135deg,var(--primary),var(--primary-deep))] px-5 py-2.5 text-sm font-medium text-white shadow-[0_18px_40px_-22px_rgba(143,109,60,0.85)] transition-colors hover:brightness-105"
          >
            Begin writing
          </button>
          <button
            onClick={handleRetry}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-2.5 text-sm font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualItem) => {
          const confession = allConfessions[virtualItem.index];
          if (!confession) return null;

          return (
            <div
              key={confession.id}
              className="absolute inset-x-0 top-0"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div className="pb-5">
                <ConfessionCard confession={confession} />
              </div>
            </div>
          );
        })}
      </div>

      <div ref={loadMoreRef} className="flex justify-center py-6">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-sm text-[var(--secondary)]">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading more confessions...
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
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg transition-all hover:bg-[var(--primary-deep)] hover:-translate-y-1"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      {/* Sticky Bottom Comparison Panel */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[var(--primary)] shrink-0">
              <Scale className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Metrics Inspector</p>
              <p className="text-[11px] text-zinc-400">
                {selectedIds.length === 1
                  ? "Select one more to unlock side-by-side view"
                  : `${selectedIds.length} confessions queued for metrics analysis`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={clearItems}
              className="h-8 w-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300 rounded-xl hover:bg-zinc-900 transition-colors cursor-pointer"
              title="Clear selection queue"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={selectedIds.length < 2}
              onClick={handleNavigateToComparison}
              className={`h-8 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${selectedIds.length >= 2
                  ? "bg-[var(--primary)] text-white hover:brightness-105 shadow-md"
                  : "bg-zinc-900 text-zinc-600 border border-zinc-800/60 cursor-not-allowed opacity-60"
                }`}
            >
              <span>Compare</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

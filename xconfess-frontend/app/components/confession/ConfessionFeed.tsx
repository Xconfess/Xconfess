"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ConfessionCard } from "./ConfessionCard";
import { ConfessionFeedSkeleton } from "./LoadingSkeleton";
import { useConfessionsQuery } from "../../lib/hooks/useConfessionsQuery";
import { usePaginationState } from "../../lib/hooks/usePaginationState";
import ErrorState from "../common/ErrorState";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const ESTIMATED_CARD_HEIGHT = 300;

export const ConfessionFeed = () => {
  const { page, setPage, limit } = usePaginationState();

  const { data, isLoading, isFetching, error, refetch } = useConfessionsQuery({
    page,
    limit,
  });

  const confessions = data?.confessions ?? [];
  const totalPages = data?.total
    ? Math.ceil(data.total / limit)
    : data?.hasMore
      ? page + 1
      : page;
  const isEmpty = !isLoading && confessions.length === 0;

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: confessions.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 3,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Retry handler
  const handleRetry = () => {
    void refetch();
  };

  const scrollToComposer = () => {
    document.getElementById("composer")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // Render pagination items
  const renderPaginationItems = () => {
    const items = [];
    const maxVisible = 5;

    let startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => setPage(1)}>1</PaginationLink>
        </PaginationItem>,
      );
      if (startPage > 2) {
        items.push(<PaginationEllipsis key="ellipsis-start" />);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink isActive={i === page} onClick={() => setPage(i)}>
            {i}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(<PaginationEllipsis key="ellipsis-end" />);
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setPage(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    return items;
  };

  return (
    <div className="mx-auto w-full max-w-3xl py-2">
      {/* Reserve vertical space to avoid layout shifts between states */}
      <div className="min-h-[320px] sm:min-h-[420px] md:min-h-[520px]">
        {/* Empty State */}
        {isEmpty && (
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
                onClick={() => scrollToComposer()}
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
        )}

        {/* Error State (do not expose raw technical errors) */}
        {error && (
          <ErrorState
            error={undefined}
            title="Unable to load feed"
            description="We couldn't load recent confessions. Please try again or check your connection."
            showRetry
            onRetry={handleRetry}
          />
        )}

        {/* Loading state (skeleton kept inside the reserved space to avoid jumps) */}
        {isLoading && <ConfessionFeedSkeleton />}

        {/* Confessions — virtualised list */}
        {!isEmpty && confessions.length > 0 && (
          <div
            ref={scrollParentRef}
            className={`overflow-y-auto transition-opacity duration-200 ${isFetching && !isLoading ? "opacity-50" : "opacity-100"}`}
            style={{ height: "calc(100vh - 320px)", minHeight: 400 }}
            data-testid="virtual-scroll-container"
          >
            <div
              style={{ height: virtualizer.getTotalSize(), position: "relative" }}
            >
              {virtualItems.map((virtualRow) => {
                const confession = confessions[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: "1.25rem",
                    }}
                  >
                    <ConfessionCard confession={confession} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!isEmpty && totalPages > 1 && (
        <div className="mt-12 py-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => page > 1 && setPage(page - 1)}
                  aria-disabled={page <= 1}
                  className={
                    page <= 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>

              {renderPaginationItems()}

              <PaginationItem>
                <PaginationNext
                  onClick={() => page < totalPages && setPage(page + 1)}
                  aria-disabled={page >= totalPages}
                  className={
                    page >= totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <div className="mt-4 text-center text-xs text-[var(--secondary)]">
            Page {page} of {totalPages}
          </div>
        </div>
      )}
    </div>
  );
};

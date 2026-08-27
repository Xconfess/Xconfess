"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchResultItem } from "./SearchResultItem";
import type { SearchConfession } from "@/app/lib/types/search";
import { SkeletonCard } from "@/app/components/confession/LoadingSkeleton";
import { cn } from "@/app/lib/utils/cn";
import { Scale, ArrowRight, X } from "lucide-react";

interface SearchResultsProps {
  results: SearchConfession[];
  query?: string;
  isLoading: boolean;
  isEmpty: boolean;
  hasSearched: boolean;
  page: number;
  hasMore: boolean;
  total?: number;
  statusMeta?: {
    partial: boolean;
    degraded: boolean;
    message: string | null;
    warnings: string[];
    searchType?: string;
  } | null;
  hasActiveFilters?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onClearFilters?: () => void;
  onUseSuggestion?: (query: string) => void;
  className?: string;
  isRetrying?: boolean;
}

export function SearchResults({
  results,
  query,
  isLoading,
  isEmpty,
  hasSearched,
  page,
  hasMore,
  total,
  statusMeta,
  hasActiveFilters = false,
  onLoadMore,
  onRetry,
  onClearFilters,
  onUseSuggestion,
  className,
  isRetrying = false,
}: SearchResultsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const suggestions = ["confession", "secret", "relationships"];

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        // Enforce maximum allocation limit constraint of 2 confessions
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const navigateToComparison = () => {
    if (selectedIds.length === 2) {
      router.push(`/compare?ids=${selectedIds.join(",")}`);
    }
  };

  if (isLoading && page === 1) {
    return (
      <div
        className={cn("space-y-4", className)}
        role="status"
        aria-live="polite"
        aria-label={
          isRetrying
            ? "Loading search results, retrying after a connection issue"
            : "Loading search results"
        }
      >
        {isRetrying && (
          <p className="text-center text-sm text-[var(--secondary)]">
            Search is taking longer than usual, retrying...
          </p>
        )}
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div
        className={cn(
          "luxury-panel flex flex-col items-center justify-center rounded-[28px] border border-dashed px-4 py-16",
          className
        )}
        role="status"
      >
        <p className="text-center text-[var(--foreground)]">
          Enter a search term or use filters to find confessions.
        </p>
        <p className="mt-2 text-center text-sm text-[var(--secondary)]">
          Try &quot;love&quot;, &quot;secret&quot;, or &quot;coding&quot;.
        </p>
      </div>
    );
  }

  if (isEmpty && !isLoading) {
    return (
      <div
        className={cn(
          "luxury-panel flex flex-col items-center justify-center rounded-[28px] border border-dashed px-4 py-16",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <p className="text-center text-[var(--foreground)]">
          No confessions match your search.
        </p>
        <p className="mt-2 text-center text-sm text-[var(--secondary)]">
          {statusMeta?.partial
            ? "Results may be partial right now. Try a broader query while search catches up."
            : "Try broader keywords, adjust your filters, or explore trending topics."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-[linear-gradient(135deg,var(--primary),var(--primary-deep))] px-4 py-2 text-sm font-medium text-white shadow-[0_18px_40px_-22px_rgba(88,105,125,0.55)] transition-colors hover:brightness-105"
            >
              Retry search
            </button>
          )}
          {hasActiveFilters && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onUseSuggestion?.(suggestion)}
              className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              Try &quot;{suggestion}&quot;
            </button>
          ))}
        </div>
      </div>
    );
  }

  const start = 1;
  const end = results.length;
  const showCount = total != null && total > 0;

  return (
    <div className={cn("space-y-4 relative pb-24", className)} role="region" aria-label="Search results">
      {statusMeta?.degraded && (
        <div
          className="rounded-[22px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--foreground)]"
          role="status"
        >
          <p className="font-medium">
            {statusMeta.partial
              ? "Partial results shown"
              : "Search is in a degraded state"}
          </p>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            {statusMeta.message ||
              statusMeta.warnings[0] ||
              "Some upstream data may be delayed. You can retry or continue with the current results."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-white/65 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-white"
              >
                Retry
              </button>
            )}
            {hasActiveFilters && onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="rounded-full border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--secondary)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--foreground)]"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {showCount && (
        <p className="text-sm text-[var(--secondary)]">
          Showing {start}-{end} of {total} result{total !== 1 ? "s" : ""}
        </p>
      )}

      <ul className="list-none space-y-3" role="list">
        {results.map((c) => (
          <li key={c.id} role="listitem" className="relative group flex items-start gap-3">
            <div className="pt-5 pl-2 flex items-center justify-center shrink-0">
              <input
                type="checkbox"
                checked={selectedIds.includes(c.id)}
                onChange={() => handleToggleSelect(c.id)}
                className="h-4 w-4 rounded-md border-zinc-700 bg-zinc-900 text-amber-500 accent-amber-500 focus:ring-0 cursor-pointer"
                title="Select confession for perspective comparison comparison"
              />
            </div>
            <div className="flex-1 min-w-0">
              <SearchResultItem confession={c} searchQuery={query} />
            </div>
          </li>
        ))}
      </ul>

      {/* Floating comparison context action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-zinc-800 text-amber-400">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Compare Perspectives</p>
              <p className="text-xs text-zinc-400">
                {selectedIds.length === 1
                  ? "Select 1 more confession to compare"
                  : "2 confessions queued up for side-by-side view"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
              title="Clear selection checklist queue"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={selectedIds.length !== 2}
              onClick={navigateToComparison}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 shadow-md",
                selectedIds.length === 2
                  ? "bg-amber-500 text-zinc-950 hover:bg-amber-400 cursor-pointer"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50"
              )}
            >
              <span>Compare</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {isLoading && page > 1 && (
        <div className="flex justify-center py-6" aria-hidden>
          <div className="flex gap-2">
            <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:0.1s]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--primary)] [animation-delay:0.2s]" />
          </div>
        </div>
      )}

      {hasMore && !isLoading && onLoadMore && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

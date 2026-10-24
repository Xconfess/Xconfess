"use client";

import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { SORT_OPTIONS, type SearchFilters } from "@/app/lib/types/search";
import { cn } from "@/app/lib/utils/cn";

interface FilterSidebarProps {
  filters: SearchFilters;
  onApply: (f: SearchFilters) => void;
  onReset: () => void;
  className?: string;
}

export function FilterSidebar({
  filters,
  onApply,
  onReset,
  className,
}: FilterSidebarProps) {
  const [local, setLocal] = useState<SearchFilters>({ ...filters });

  useEffect(() => {
    setLocal({ ...filters });
  }, [filters]);

  const handleApply = () => {
    onApply(local);
  };

  const handleReset = () => {
    setLocal({
      sort: "newest",
      dateFrom: undefined,
      dateTo: undefined,
      minReactions: undefined,
      gender: undefined,
    });
    onReset();
  };

  const hasChanges =
    local.sort !== filters.sort ||
    local.dateFrom !== filters.dateFrom ||
    local.dateTo !== filters.dateTo ||
    local.minReactions !== filters.minReactions;

  return (
    <aside
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:p-6 h-fit",
        className
      )}
      role="search"
      aria-label="Search filters"
    >
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-5">Filters</h3>

      <div className="space-y-6">
        {/* Sort */}
        <div>
          <label
            htmlFor="search-sort"
            className="block text-xs font-medium text-[var(--text-muted)] mb-2"
          >
            Sort by
          </label>
          <select
            id="search-sort"
            value={local.sort}
            onChange={(e) =>
              setLocal((prev) => ({
                ...prev,
                sort: e.target.value as SearchFilters["sort"],
              }))
            }
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--border)]"
            aria-label="Sort results"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="space-y-3">
          <span className="block text-xs font-medium text-[var(--text-muted)]">
            Date range
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="filter-date-from" className="sr-only">
                From date
              </label>
              <input
                id="filter-date-from"
                type="date"
                value={local.dateFrom ?? ""}
                onChange={(e) =>
                  setLocal((prev) => ({
                    ...prev,
                    dateFrom: e.target.value || undefined,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--border)] [color-scheme:dark]"
                aria-label="From date"
              />
            </div>
            <div>
              <label htmlFor="filter-date-to" className="sr-only">
                To date
              </label>
              <input
                id="filter-date-to"
                type="date"
                value={local.dateTo ?? ""}
                onChange={(e) =>
                  setLocal((prev) => ({
                    ...prev,
                    dateTo: e.target.value || undefined,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--border)] [color-scheme:dark]"
                aria-label="To date"
              />
            </div>
          </div>
        </div>

        {/* Reaction count */}
        <div>
          <label
            htmlFor="filter-min-reactions"
            className="block text-xs font-medium text-[var(--text-muted)] mb-2"
          >
            Min. reactions ({local.minReactions ?? 0})
          </label>
          <input
            id="filter-min-reactions"
            type="range"
            min={0}
            max={50}
            step={1}
            value={local.minReactions ?? 0}
            onChange={(e) =>
              setLocal((prev) => ({
                ...prev,
                minReactions: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="w-full h-2 rounded-lg appearance-none bg-[var(--surface-elevated)] accent-zinc-400"
            aria-valuemin={0}
            aria-valuemax={50}
            aria-valuenow={local.minReactions ?? 0}
            aria-label="Minimum reaction count"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleApply}
            disabled={!hasChanges}
            className="w-full border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
          >
            Apply filters
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            className="w-full text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            Reset
          </Button>
        </div>
      </div>
    </aside>
  );
}

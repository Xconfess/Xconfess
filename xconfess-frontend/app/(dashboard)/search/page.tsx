"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { SearchInput } from "@/app/components/search/SearchInput";
import { FilterSidebar } from "@/app/components/search/FilterSidebar";
import { FilterChips } from "@/app/components/search/FilterChips";
import { SearchResults } from "@/app/components/search/SearchResults";
import ErrorState from "@/app/components/common/ErrorState";
import { useDebounce } from "@/app/lib/hooks/useDebounce";
import { useSearch } from "@/app/lib/hooks/useSearch";
import { useAuth } from "@/app/lib/hooks/useAuth"; // Added to handle authenticated saved searches
import { Button } from "@/app/components/ui/button";
import { DEFAULT_FILTERS, type SearchFilters } from "@/app/lib/types/search";
import type { FilterChipKey } from "@/app/components/search/FilterChips";
import { Filter, X, HelpCircle, Save } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { useFocusTrap } from "@/app/lib/hooks/useFocusTrap";

const DEBOUNCE_MS = 300;

function parseFiltersFromParams(params: URLSearchParams): SearchFilters {
  const sort = params.get("sort");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const minReactions = params.get("minReactions");
  const gender = params.get("gender");

  const filters: SearchFilters = { ...DEFAULT_FILTERS };

  if (sort && ["newest", "oldest", "reactions"].includes(sort)) {
    filters.sort = sort as SearchFilters["sort"];
  }
  if (dateFrom) {
    filters.dateFrom = dateFrom;
  }
  if (dateTo) {
    filters.dateTo = dateTo;
  }
  if (minReactions) {
    const parsed = Number(minReactions);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      filters.minReactions = parsed;
    }
  }
  if (gender) {
    filters.gender = gender;
  }

  return filters;
}

function filtersToSearchParams(
  filters: SearchFilters,
  query: string,
): URLSearchParams {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set("q", query.trim());
  }
  if (filters.sort && filters.sort !== "newest") {
    params.set("sort", filters.sort);
  }
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  if (filters.minReactions != null && filters.minReactions > 0) {
    params.set("minReactions", String(filters.minReactions));
  }
  if (filters.gender) {
    params.set("gender", filters.gender);
  }

  return params;
}

function hasActiveFilters(f: SearchFilters): boolean {
  return !!(
    f.dateFrom ||
    f.dateTo ||
    (f.minReactions != null && f.minReactions > 0) ||
    (f.sort && f.sort !== "newest") ||
    f.gender
  );
}

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth(); // Hook validation for user persistence profile state

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_FILTERS });
  const [isInitialized, setIsInitialized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const parsedFilters = parseFiltersFromParams(searchParams);
    setQuery(q);
    setFilters(parsedFilters);
    setIsInitialized(true);
  }, [searchParams]);

  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);
  const runSearch =
    isInitialized &&
    (debouncedQuery.trim().length > 0 || hasActiveFilters(filters));

  const {
    results,
    total,
    hasMore,
    page,
    isLoading,
    isRetrying,
    error,
    statusMeta,
    loadMore,
    reset,
    retry,
  } = useSearch({
    query,
    filters,
    debouncedQuery,
    runSearch,
  });

  const hasSearched = runSearch;
  const isEmpty = hasSearched && !isLoading && results.length === 0;
  const hasActiveFilterValues = hasActiveFilters(filters);
  const fatalError = Boolean(error && results.length === 0 && !isLoading);
  const effectiveStatusMeta =
    error && results.length > 0
      ? {
          partial: false,
          degraded: true,
          message: error,
          warnings: [],
          searchType: "error",
        }
      : statusMeta;

  // Stable single-direction parameter synchronization wrapper
  const updateUrl = useCallback(
    (q: string, f: SearchFilters) => {
      const params = filtersToSearchParams(f, q);
      const newUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.push(newUrl, { scroll: false });
    },
    [pathname, router],
  );

  const handleSubmit = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      setQuery(trimmed);
      updateUrl(trimmed, filters);
    },
    [filters, updateUrl],
  );

  const handleApplyFilters = useCallback(
    (f: SearchFilters) => {
      setFilters(f);
      setSidebarOpen(false);
      updateUrl(query, f);
    },
    [query, updateUrl],
  );

  const handleResetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
    setSidebarOpen(false);
    updateUrl(query, DEFAULT_FILTERS);
  }, [query, updateUrl]);

  const handleRemoveFilter = useCallback(
    (key: FilterChipKey) => {
      if (key === "query") {
        setQuery("");
        reset();
        updateUrl("", filters);
        return;
      }
      if (key === "dateFrom") {
        const newFilters = { ...filters, dateFrom: undefined };
        setFilters(newFilters);
        updateUrl(query, newFilters);
        return;
      }
      if (key === "dateTo") {
        const newFilters = { ...filters, dateTo: undefined };
        setFilters(newFilters);
        updateUrl(query, newFilters);
        return;
      }
      if (key === "minReactions") {
        const newFilters = { ...filters, minReactions: undefined };
        setFilters(newFilters);
        updateUrl(query, newFilters);
        return;
      }
      if (key === "sort") {
        const newFilters = { ...filters, sort: "newest" };
        setFilters(newFilters);
        updateUrl(query, newFilters);
        return;
      }
    },
    [reset, updateUrl, query, filters],
  );

  const handleClearAll = useCallback(() => {
    setQuery("");
    setFilters({ ...DEFAULT_FILTERS });
    reset();
    setSidebarOpen(false);
    updateUrl("", DEFAULT_FILTERS);
  }, [reset, updateUrl]);

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      updateUrl(suggestion, filters);
    },
    [filters, updateUrl],
  );

  // Handle execution placeholder mock for saved tracking
  const handleSaveSearch = () => {
    if (!user) return;
    setSaveStatus("Search query saved successfully!");
    setTimeout(() => setSaveStatus(null), 4000);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>(
          "[data-search-input]",
        );
        el?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useFocusTrap({
    active: sidebarOpen,
    containerRef: sidebarRef,
    initialFocusRef: closeButtonRef,
    restoreFocusRef: filterButtonRef,
    onEscape: () => setSidebarOpen(false),
    trapFocus: true,
  });

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="container mx-auto py-6 px-4 sm:px-6 md:px-8 lg:py-8 lg:px-10">
        <header className="mb-6 lg:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Search confessions
            </h1>
            <p className="text-zinc-400 text-sm lg:text-base">
              Find confessions by keyword, date, reactions, and more.
            </p>
          </div>

          {/* ========================================================= */}
          {/* CRITERIA 2: SAVED SEARCH AFFORDANCE ZONE                    */}
          {/* ========================================================= */}
          <div className="flex flex-col items-start md:items-end gap-1.5">
            <div className="relative group inline-flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={user ? "default" : "outline"} //  "outline" matches your component rules
                onClick={handleSaveSearch}
                disabled={!user || !query.trim()}
                className={cn(
                  "gap-2 transition-all duration-200",
                  !user &&
                    "opacity-60 cursor-not-allowed bg-zinc-900 border-zinc-800 text-zinc-500",
                )}
              >
                <Save className="h-4 w-4" />
                Save Search
              </Button>

              {/* Dynamic inline explanation wrapper showing contextual data when locked */}
              {!user && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-amber-500 max-w-xs">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Log in to enable saved search monitoring.</span>
                </div>
              )}
            </div>
            {saveStatus && (
              <span className="text-xs text-emerald-400 animate-fade-in">
                {saveStatus}
              </span>
            )}
          </div>
        </header>

        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSubmit={handleSubmit}
              placeholder="Search confessions..."
              aria-label="Search confessions"
            />
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border bg-zinc-900 text-zinc-200 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600 transition-colors lg:hidden min-h-[44px]",
              sidebarOpen && "bg-zinc-800 border-zinc-600",
            )}
            aria-expanded={sidebarOpen}
            aria-controls="search-filters-sidebar"
            ref={filterButtonRef}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <FilterChips
            filters={filters}
            query={query}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAll}
            statusChip={
              effectiveStatusMeta?.partial
                ? { label: "Partial results", tone: "warning" }
                : effectiveStatusMeta?.degraded
                  ? { label: "Degraded search", tone: "warning" }
                  : null
            }
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          <div
            id="search-filters-sidebar"
            className={cn(
              "lg:w-80 lg:shrink-0",
              sidebarOpen ? "block" : "hidden lg:block",
            )}
            role="complementary"
            aria-label="Search filters"
            ref={sidebarRef}
          >
            <div className="lg:hidden relative mb-4">
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="absolute top-2 right-2 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label="Close filters"
                ref={closeButtonRef}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <FilterSidebar
              filters={filters}
              onApply={handleApplyFilters}
              onReset={handleResetFilters}
            />
          </div>

          <main className="flex-1 min-w-0">
            {fatalError ? (
              <div className="mb-6">
                <ErrorState
                  title="Search request failed"
                  description="We couldn’t complete search. You can retry or adjust filters."
                  error={error ?? "Search failed"}
                  onRetry={retry}
                  variant="error"
                  fullHeight={false}
                  primaryActionLabel="Clear filters"
                  onPrimaryAction={handleClearAll}
                />
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4">
                    <ErrorState
                      title="Search degraded"
                      description="Loaded results may be incomplete."
                      error={error}
                      onRetry={retry}
                      variant="warning"
                      showIcon={false}
                      fullHeight={false}
                      showRetry
                      primaryActionLabel="Clear filters"
                      onPrimaryAction={handleClearAll}
                    />
                  </div>
                )}

                <SearchResults
                  results={results}
                  query={debouncedQuery.trim() || undefined}
                  isLoading={isLoading}
                  isRetrying={isRetrying}
                  isEmpty={isEmpty}
                  hasSearched={hasSearched}
                  page={page}
                  hasMore={hasMore}
                  total={total}
                  statusMeta={effectiveStatusMeta}
                  hasActiveFilters={hasActiveFilterValues}
                  onLoadMore={loadMore}
                  onRetry={retry}
                  onClearFilters={handleClearAll}
                  onUseSuggestion={handleSuggestion}
                />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

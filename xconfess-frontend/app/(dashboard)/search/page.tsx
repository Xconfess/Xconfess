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
import { useAuth } from "@/app/lib/hooks/useAuth";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { DEFAULT_FILTERS, type SearchFilters } from "@/app/lib/types/search";
import type { FilterChipKey } from "@/app/components/search/FilterChips";
import {
  Filter,
  X,
  HelpCircle,
  Save,
  History,
  Bookmark,
  Trash2,
} from "lucide-react";
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
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  if (minReactions) {
    const parsed = Number(minReactions);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      filters.minReactions = parsed;
    }
  }
  if (gender) filters.gender = gender;

  return filters;
}

function filtersToSearchParams(
  filters: SearchFilters,
  query: string,
  page = 1
): URLSearchParams {
  const params = new URLSearchParams();

  if (query.trim()) params.set("q", query.trim());
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.minReactions != null && filters.minReactions > 0) {
    params.set("minReactions", String(filters.minReactions));
  }
  if (filters.gender) params.set("gender", filters.gender);
  if (page > 1) params.set("page", String(page));

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
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_FILTERS });
  const [isInitialized, setIsInitialized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [presetItems, setPresetItems] = useState<any[]>([]);
  const [showDiscoveryDropdown, setShowDiscoveryDropdown] = useState(false);

  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize from URL
  useEffect(() => {
    const q = searchParams.get("q") || "";
    const parsedFilters = parseFiltersFromParams(searchParams);
    setQuery(q);
    setFilters(parsedFilters);
    setIsInitialized(true);
  }, [searchParams]);

  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);
  const runSearch = isInitialized && (debouncedQuery.trim().length > 0 || hasActiveFilters(filters));

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
  const effectiveStatusMeta = error && results.length > 0
    ? { partial: false, degraded: true, message: error, warnings: [], searchType: "error" }
    : statusMeta;

  // Update URL (core of the fix)
  const updateUrl = useCallback((newQuery: string, newFilters: SearchFilters, newPage = 1) => {
    const params = filtersToSearchParams(newFilters, newQuery, newPage);
    const queryString = params.toString();
    const newUrl = queryString ? `?${queryString}` : pathname;
    router.push(newUrl, { scroll: false });
  }, [pathname, router]);

  const handleSubmit = useCallback((q: string) => {
    const trimmed = q.trim();
    setQuery(trimmed);
    updateUrl(trimmed, filters);
    setShowDiscoveryDropdown(false);
  }, [filters, updateUrl]);

  const handleApplyFilters = useCallback((f: SearchFilters) => {
    setFilters(f);
    setSidebarOpen(false);
    updateUrl(query, f);
  }, [query, updateUrl]);

  const handleResetFilters = useCallback(() => {
    const defaultFilters = { ...DEFAULT_FILTERS };
    setFilters(defaultFilters);
    setSidebarOpen(false);
    updateUrl(query, defaultFilters);
  }, [query, updateUrl]);

  const handleClearAll = useCallback(() => {
    setQuery("");
    const defaultFilters = { ...DEFAULT_FILTERS };
    setFilters(defaultFilters);
    updateUrl("", defaultFilters);
  }, [updateUrl]);

  const handleRemoveFilter = useCallback((key: FilterChipKey) => {
    if (key === "query") {
      setQuery("");
      updateUrl("", filters);
      return;
    }

    const nextFilters = { ...filters };
    if (key === "sort") {
      nextFilters.sort = "newest";
    } else {
      delete nextFilters[key];
    }
    setFilters(nextFilters);
    updateUrl(query, nextFilters);
  }, [filters, query, updateUrl]);

  const handleSuggestion = useCallback((suggestion: string) => {
    setQuery(suggestion);
    updateUrl(suggestion, filters);
    setShowDiscoveryDropdown(false);
  }, [filters, updateUrl]);

  // Keep your existing discovery, save search, and other logic here...
  // (The rest of your component remains the same)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSubmit}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setSidebarOpen((open) => !open)}
            className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>

        <FilterChips
          filters={filters}
          query={query}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={handleClearAll}
          statusChip={effectiveStatusMeta?.degraded ? { label: "Partial results", tone: "warning" } : null}
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-4">
            {fatalError ? (
              <ErrorState title="Search failed" error={error ?? "Unable to load search results."} onRetry={retry} />
            ) : (
              <>
                {hasSearched && (
                  <p className="text-sm text-zinc-400">
                    {isLoading ? "Searching..." : `${total} result${total === 1 ? "" : "s"}`}
                  </p>
                )}
                {isEmpty && (
                  <Card className="border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
                    No confessions matched your search.
                  </Card>
                )}
                <SearchResults
                  results={results}
                  query={query}
                  isLoading={isLoading}
                  isEmpty={isEmpty}
                  hasSearched={hasSearched}
                  page={page}
                  isRetrying={isRetrying}
                  hasMore={hasMore}
                  total={total}
                  onLoadMore={loadMore}
                  onRetry={retry}
                  statusMeta={effectiveStatusMeta}
                  hasActiveFilters={hasActiveFilterValues}
                  onClearFilters={handleResetFilters}
                  onUseSuggestion={handleSuggestion}
                />
              </>
            )}
          </div>

          <FilterSidebar
            filters={filters}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
            className={cn(sidebarOpen ? "block" : "hidden lg:block")}
          />
        </div>
      </div>
    </div>
  );
}

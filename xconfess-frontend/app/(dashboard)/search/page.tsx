"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { SearchInput } from "@/app/components/search/SearchInput";
import { FilterSidebar } from "@/app/components/search/FilterSidebar";
import { FilterChips } from "@/app/components/search/FilterChips";
import { SearchResults } from "@/app/components/search/SearchResults";
import ErrorState from "@/app/components/common/ErrorState";
import { useDebounce } from "@/app/lib/hooks/useDebounce";
import { useSearch } from "@/app/lib/hooks/useSearch";
import { useAuth } from "@/app/lib/hooks/useAuth";
import { DEFAULT_FILTERS, type SearchFilters } from "@/app/lib/types/search";
import type { FilterChipKey } from "@/app/components/search/FilterChips";
import { cn } from "@/app/lib/utils/cn";

const DEBOUNCE_MS = 300;

function parseFiltersFromParams(params: URLSearchParams): SearchFilters {
  const filters: SearchFilters = { ...DEFAULT_FILTERS };

  const sort = params.get("sort");
  if (sort && ["newest", "oldest", "reactions"].includes(sort)) {
    filters.sort = sort as SearchFilters["sort"];
  }
  if (params.get("dateFrom")) filters.dateFrom = params.get("dateFrom")!;
  if (params.get("dateTo")) filters.dateTo = params.get("dateTo")!;
  const minReactions = params.get("minReactions");
  if (minReactions) {
    const parsed = Number(minReactions);
    if (!isNaN(parsed) && parsed >= 0) filters.minReactions = parsed;
  }
  if (params.get("gender")) filters.gender = params.get("gender")!;

  return filters;
}

function filtersToSearchParams(filters: SearchFilters, query: string): URLSearchParams {
  const params = new URLSearchParams();

  if (query.trim()) params.set("q", query.trim());
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.minReactions != null && filters.minReactions > 0) {
    params.set("minReactions", String(filters.minReactions));
  }
  if (filters.gender) params.set("gender", filters.gender);

  return params;
}

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_FILTERS });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync from URL on load / back-forward
  useEffect(() => {
    const q = searchParams.get("q") || "";
    const parsedFilters = parseFiltersFromParams(searchParams);
    setQuery(q);
    setFilters(parsedFilters);
  }, [searchParams]);

  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);

  const {
    results,
    isLoading,
    error,
    loadMore,
  } = useSearch({
    query: debouncedQuery,
    filters,
  });

  const updateUrl = useCallback((newQuery: string, newFilters: SearchFilters) => {
    const params = filtersToSearchParams(newFilters, newQuery);
    const newUrl = params.toString() ? `\( {pathname}? \){params.toString()}` : pathname;
    router.push(newUrl, { scroll: false });
  }, [pathname, router]);

  const handleSearch = useCallback((newQuery: string) => {
    const trimmed = newQuery.trim();
    setQuery(trimmed);
    updateUrl(trimmed, filters);
  }, [filters, updateUrl]);

  const handleApplyFilters = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters);
    setSidebarOpen(false);
    updateUrl(query, newFilters);
  }, [query, updateUrl]);

  const handleReset = useCallback(() => {
    const resetFilters = { ...DEFAULT_FILTERS };
    setFilters(resetFilters);
    setQuery("");
    updateUrl("", resetFilters);
  }, [updateUrl]);

  const handleRemoveFilter = useCallback((key: FilterChipKey) => {
    // Implement removal logic as needed
    // Example:
    let newFilters = { ...filters };
    if (key === "dateFrom") newFilters.dateFrom = undefined;
    if (key === "dateTo") newFilters.dateTo = undefined;
    // ... other keys
    setFilters(newFilters);
    updateUrl(query, newFilters);
  }, [filters, query, updateUrl]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <SearchInput value={query} onSubmit={handleSearch} />

      <FilterChips 
        filters={filters} 
        onRemove={handleRemoveFilter} 
        onClear={handleReset} 
      />

      {sidebarOpen && (
        <FilterSidebar 
          filters={filters} 
          onApply={handleApplyFilters} 
          onClose={() => setSidebarOpen(false)} 
        />
      )}

      <SearchResults 
        results={results} 
        isLoading={isLoading} 
        error={error} 
        loadMore={loadMore} 
      />
    </div>
  );
                                  }

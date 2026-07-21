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

const EXAMPLE_SUGGESTIONS = [
  "crypto",
  "stellar",
  "secret",
  "developer",
  "node",
];

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
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({ ...DEFAULT_FILTERS });
  const [isInitialized, setIsInitialized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // States for Discovery History & Presets
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [presetItems, setPresetItems] = useState<any[]>([]);
  const [showDiscoveryDropdown, setShowDiscoveryDropdown] = useState(false);

  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Fetch search discovery history and custom filters
  const fetchDiscoveryData = useCallback(async () => {
    if (!user) return;
    try {
      const [historyRes, presetsRes] = await Promise.all([
        fetch("/api/confessions/search/discovery/history"),
        fetch("/api/confessions/search/discovery/presets"),
      ]);
      if (historyRes.ok) setHistoryItems(await historyRes.json());
      if (presetsRes.ok) setPresetItems(await presetsRes.json());
    } catch (err) {
      console.error("Failed to load discovery criteria details:", err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDiscoveryData();
    }
  }, [user, fetchDiscoveryData, searchParams]);

  // Handle outside dropdown clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDiscoveryDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      setShowDiscoveryDropdown(false);
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
        const newFilters = { ...filters, sort: "newest" as const };
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
      setShowDiscoveryDropdown(false);
    },
    [filters, updateUrl],
  );

  const handleApplyPreset = useCallback((presetFilters: any) => {
    const incomingSort = ["newest", "oldest", "reactions"].includes(presetFilters?.sort)
      ? (presetFilters.sort as SearchFilters["sort"])
      : "newest";

    const updated: SearchFilters = {
      ...DEFAULT_FILTERS,
      ...presetFilters,
      sort: incomingSort
    };

    setFilters(updated);
    updateUrl(query, updated);
    setShowDiscoveryDropdown(false);
  }, [query, updateUrl]);

  const handleSaveSearch = async () => {
    if (!user || !query.trim()) return;
    setIsSaving(true);
    try {
      const presetName = prompt("Enter a nickname for this search setup:", `Search: ${query}`);
      if (!presetName) {
        setIsSaving(false);
        return;
      }

      const response = await fetch("/api/confessions/search/discovery/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName,
          filters: filters,
        }),
      });

      if (response.ok) {
        setSaveStatus("Preset locked and saved successfully!");
        fetchDiscoveryData();
      } else {
        setSaveStatus("Failed to save parameter configurations.");
      }
    } catch (err) {
      setSaveStatus("Network transmission timeout.");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  const handleDeletePreset = async (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/confessions/search/discovery/presets/${presetId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchDiscoveryData();
      }
    } catch (err) {
      console.error("Error wiping preset configuration:", err);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex gap-3" ref={dropdownRef}>
          <div className="flex-1 min-w-0 relative">
            <SearchInput
              value={query}
              onChange={(val) => {
                setQuery(val);
                if (!showDiscoveryDropdown) setShowDiscoveryDropdown(true);
              }}
              onSubmit={handleSubmit}
              placeholder="Search confessions..."
              aria-label="Search confessions"
              onFocus={() => setShowDiscoveryDropdown(true)}
            />

            {/* Interactive Search Discovery & History Dropdown Overlay */}
            {showDiscoveryDropdown && user && (historyItems.length > 0 || presetItems.length > 0) && (
              <Card className="absolute top-full left-0 right-0 z-50 mt-2 bg-zinc-900 border-zinc-800 shadow-2xl max-h-80 overflow-y-auto p-2 flex flex-col gap-3">
                {presetItems.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <Bookmark className="h-3.5 w-3.5 text-yellow-500" />
                      Saved Search Presets
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {presetItems.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleApplyPreset(p.filters)}
                          className="flex items-center justify-between text-sm text-zinc-300 hover:bg-zinc-800/80 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                        >
                          <span className="truncate font-medium text-zinc-200">{p.name}</span>
                          <button
                            type="button"
                            onClick={(e) => handleDeletePreset(e, p.id)}
                            className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors"
                            title="Delete configuration save slot"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {historyItems.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-1 flex items-center gap-1.5 uppercase tracking-wider">
                      <History className="h-3.5 w-3.5 text-zinc-400" />
                      Recent Searches
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {historyItems.map((h) => (
                        <div
                          key={h.id}
                          onClick={() => handleSuggestion(h.query)}
                          className="text-sm text-zinc-400 hover:bg-zinc-800/80 hover:text-white px-3 py-2 rounded-lg cursor-pointer transition-colors truncate"
                        >
                          {h.query}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>

          <div className="flex flex-col items-start md:items-end gap-1.5">
            <div className="relative group inline-flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={user ? "default" : "outline"}
                disabled={!user || !query.trim() || isSaving}
                onClick={handleSaveSearch}
                className={cn(
                  "gap-2 transition-all duration-200",
                  !user &&
                  "opacity-60 cursor-not-allowed bg-zinc-900 border-zinc-800 text-zinc-500",
                )}
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save Search"}
              </Button>

              {!user && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-amber-500 max-w-xs">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Log in to enable saved search monitoring.</span>
                </div>
              )}
            </div>
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

        <FilterChips filters={filters} onRemoveFilter={handleRemoveFilter} onClearAll={handleClearAll} />
      </div>

      <div className="flex gap-8">
        <FilterSidebar
          filters={filters}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
        />

        <main className="flex-1 min-w-0">
          {fatalError ? (
            <div className="mb-6">
              <ErrorState
                title="Search request failed"
                description="We couldn't complete search. You can retry or adjust filters."
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

              {isEmpty && (
                <Card className="p-6 md:p-8 text-center border border-zinc-800 bg-zinc-900/50 mb-6 max-w-2xl mx-auto">
                  <div className="mx-auto w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                    <HelpCircle className="h-6 w-6 text-zinc-400" />
                  </div>
                  <h3 className="text-lg font-medium text-zinc-200 mb-2">
                    No matches found
                  </h3>
                  <p className="text-sm text-zinc-400 mb-6">
                    Your current selection filters may be too narrow or the
                    sequence doesn't exist. Try expanding your parameters or
                    running an example query suggestion.
                  </p>

                  <div className="flex flex-col items-center justify-center gap-4">
                    {hasActiveFilterValues && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearAll}
                        className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                      >
                        Clear Active Search Filters
                      </Button>
                    )}

                    <div className="w-full pt-4 border-t border-zinc-800/60">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider block mb-2.5">
                        Try searching popular trends:
                      </span>
                      <div className="flex flex-wrap justify-center gap-2">
                        {EXAMPLE_SUGGESTIONS.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleSuggestion(tag)}
                            className="px-2.5 py-1 text-xs font-medium rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors border border-zinc-700/50"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
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
  );
}

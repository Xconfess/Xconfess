"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchConfession, SearchFilters } from "@/app/lib/types/search";
import { logError } from "@/app/lib/utils/errorHandler";

const SEARCH_MAX_RETRIES = 3;
const SEARCH_BASE_DELAY_MS = 400;
const SEARCH_APPEND_ERROR_MESSAGE =
  "Couldn't load more results. Check your connection and try again.";
const DEV_BYPASS_AUTH_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

interface UseSearchOptions {
  query: string;
  filters: SearchFilters;
  debouncedQuery: string;
  runSearch: boolean;
}

interface UseSearchResult {
  results: SearchConfession[];
  total: number;
  hasMore: boolean;
  page: number;
  isLoading: boolean;
  isRetrying: boolean;
  error: string | null;
  statusMeta: {
    partial: boolean;
    degraded: boolean;
    message: string | null;
    warnings: string[];
    searchType?: string;
  } | null;
  loadMore: () => void;
  reset: () => void;
  retry: () => void;
}

function searchKey(q: string, f: SearchFilters): string {
  return [
    q,
    f.sort,
    f.dateFrom ?? "",
    f.dateTo ?? "",
    f.minReactions ?? "",
    f.gender ?? "",
  ].join("|");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function backoffMs(zeroBasedAttempt: number): number {
  return (
    SEARCH_BASE_DELAY_MS * 2 ** zeroBasedAttempt +
    Math.floor(Math.random() * 120)
  );
}

function isRetryableSearchHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function userMessageForSearchFailure(status: number | null): string {
  if (status === null) {
    return DEV_BYPASS_AUTH_ENABLED
      ? "Search is unavailable until the local backend is running."
      : "We couldn't load search results. Check your connection and try again.";
  }
  if (DEV_BYPASS_AUTH_ENABLED && status >= 500) {
    return "Search is unavailable until the local backend is running.";
  }
  if (status === 429) {
    return "Search is busy right now. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "Search is temporarily unavailable. Please try again in a moment.";
  }
  if (status === 401 || status === 403) {
    return "You need to be signed in to search.";
  }
  return "Search couldn't be completed. Please try again.";
}

async function fetchSearchWithRetry(
  url: string,
  signal: AbortSignal,
  onRetrying: (retrying: boolean) => void
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < SEARCH_MAX_RETRIES; attempt++) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (attempt > 0) {
      onRetrying(true);
      try {
        await sleep(backoffMs(attempt - 1), signal);
      } finally {
        onRetrying(false);
      }
    }

    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (fetchErr) {
      if (DEV_BYPASS_AUTH_ENABLED) {
        console.debug(
          "Skipping expected local search network error while backend is offline.",
          {
            url: "/api/confessions/search",
            attempt: attempt + 1,
          }
        );
      } else {
        logError(fetchErr, "useSearch", {
          url: "/api/confessions/search",
          attempt: attempt + 1,
          phase: "network",
          willRetry: attempt < SEARCH_MAX_RETRIES - 1,
        });
      }

      if (attempt === SEARCH_MAX_RETRIES - 1) {
        throw new Error(userMessageForSearchFailure(null));
      }
      continue;
    }

    if (res.ok) {
      return (await res.json()) as Record<string, unknown>;
    }

    if (DEV_BYPASS_AUTH_ENABLED && res.status >= 500) {
      console.debug(
        "Skipping expected local search upstream error while backend is offline.",
        {
          url: "/api/confessions/search",
          httpStatus: res.status,
          attempt: attempt + 1,
        }
      );
    } else {
      logError(new Error(`search_upstream_${res.status}`), "useSearch", {
        url: "/api/confessions/search",
        httpStatus: res.status,
        attempt: attempt + 1,
        willRetry:
          isRetryableSearchHttpStatus(res.status) &&
          attempt < SEARCH_MAX_RETRIES - 1,
      });
    }

    const canRetry =
      isRetryableSearchHttpStatus(res.status) &&
      attempt < SEARCH_MAX_RETRIES - 1;
    if (!canRetry) {
      throw new Error(userMessageForSearchFailure(res.status));
    }
  }

  throw new Error(userMessageForSearchFailure(null));
}

export function useSearch({
  filters,
  debouncedQuery,
  runSearch,
}: UseSearchOptions): UseSearchResult {
  const [results, setResults] = useState<SearchConfession[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMeta, setStatusMeta] = useState<UseSearchResult["statusMeta"]>(
    null
  );
  const [retryTick, setRetryTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef<SearchConfession[]>([]);
  const keyRef = useRef<string>("");

  const currentKey = searchKey(debouncedQuery, filters);

  useEffect(() => {
    if (!runSearch) return;
    if (currentKey === keyRef.current) return;
    keyRef.current = currentKey;
    setPage(1);
    accumulatedRef.current = [];
  }, [runSearch, currentKey]);

  useEffect(() => {
    if (!runSearch) {
      setResults([]);
      setTotal(0);
      setHasMore(false);
      setPage(1);
      setError(null);
      setStatusMeta(null);
      setIsRetrying(false);
      accumulatedRef.current = [];
      keyRef.current = "";
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    const append = page > 1;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");
    if (filters.sort && filters.sort !== "newest") params.set("sortBy", filters.sort);

    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (filters.dateFrom) params.set("startDate", filters.dateFrom);
    if (filters.dateTo) params.set("endDate", filters.dateTo);
    if (filters.minReactions != null && filters.minReactions > 0) {
      params.set("minReactions", String(filters.minReactions));
    }
    if (filters.gender) params.set("gender", filters.gender);

    if (page === 1) accumulatedRef.current = [];
    setIsLoading(true);
    setError(null);

    let cancelled = false;

    const run = async () => {
      try {
        const data = await fetchSearchWithRetry(
          `/api/confessions/search?${params}`,
          signal,
          (retrying) => {
            if (!cancelled) setIsRetrying(retrying);
          }
        );

        if (cancelled) return;

        const list = data.confessions ?? [];
        const totalCount = (data.total as number) ?? 0;
        const more = data.hasMore === true;
        const warnings = Array.isArray(data.warnings)
          ? data.warnings.filter(
              (entry: unknown) =>
                typeof entry === "string" && entry.trim().length > 0
            )
          : [];
        const partial = Boolean(data.partial);
        const degraded = Boolean(data.degraded);
        const message =
          typeof data.message === "string" && data.message.trim().length > 0
            ? data.message
            : null;
        const meta = data.meta as Record<string, unknown> | undefined;
        const searchType =
          meta && typeof meta.searchType === "string"
            ? meta.searchType
            : undefined;

        const confessionList = list as SearchConfession[];

        if (append) {
          accumulatedRef.current = [
            ...accumulatedRef.current,
            ...confessionList,
          ];
        } else {
          accumulatedRef.current = confessionList;
        }

        setResults([...accumulatedRef.current]);
        setTotal(totalCount);
        setHasMore(more);
        setStatusMeta(
          partial || degraded || warnings.length > 0 || message
            ? {
                partial,
                degraded,
                message,
                warnings,
                searchType,
              }
            : null
        );
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (cancelled) return;

        const userMessage =
          e instanceof Error ? e.message : userMessageForSearchFailure(null);

        setError(append ? SEARCH_APPEND_ERROR_MESSAGE : userMessage);
        setStatusMeta(
          append
            ? {
                partial: false,
                degraded: true,
                message: SEARCH_APPEND_ERROR_MESSAGE,
                warnings: [],
                searchType: "error",
              }
            : null
        );

        if (page === 1) {
          setResults([]);
          setTotal(0);
          setHasMore(false);
          accumulatedRef.current = [];
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRetrying(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [runSearch, page, debouncedQuery, filters, retryTick]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    setPage((p) => p + 1);
  }, [hasMore, isLoading]);

  const reset = useCallback(() => {
    setResults([]);
    setTotal(0);
    setHasMore(false);
    setPage(1);
    setError(null);
    setStatusMeta(null);
    setIsRetrying(false);
    accumulatedRef.current = [];
    keyRef.current = "";
  }, []);

  const retry = useCallback(() => {
    if (!runSearch) return;
    setRetryTick((tick) => tick + 1);
  }, [runSearch]);

  return {
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
  };
}

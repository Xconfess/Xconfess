"use client";

import { useCallback, useState } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getConfessions } from "@/app/lib/api/confessions";
import type { GetConfessionsParams } from "@/app/lib/api/confessions";
import { queryKeys } from "@/app/lib/api/queryKeys";
import {
  QueryError,
  exponentialBackoff,
  isPaginationCursorExpired,
  retryOnTransientError,
} from "@/app/lib/utils/retry";

const DEFAULT_LIMIT = 10;

/**
 * Hook for fetching confessions with standard pagination.
 * This has been standardized to use page/limit parameters for better
 * state persistence across route transitions.
 */
export function useConfessionsQuery(params: GetConfessionsParams = {}) {
  const { page = 1, limit = DEFAULT_LIMIT, ...rest } = params;

  return useQuery({
    queryKey: [...queryKeys.confessions.list(rest), { page, limit }],
    queryFn: async () => {
      const result = await getConfessions({
        page,
        limit,
        ...rest,
      });
      if (!result.ok) {
        throw new QueryError(result.error);
      }
      return result.data;
    },
    placeholderData: (previousData) => previousData,
    retry: retryOnTransientError,
    retryDelay: exponentialBackoff,
  });
}

/**
 * Hook for infinite-scroll loading of confessions using cursor-based pagination.
 * Automatically fetches the next page when `fetchNextPage` is called.
 *
 * Pagination state is defensive against a server-side cursor expiring (#2311):
 * on a `PAGINATION_CURSOR_EXPIRED` / `BAD_CURSOR` error, react-query stops
 * retrying (that would loop indefinitely on a stale cursor — the server
 * answer would be the same), {@link cursorExpired} flips to `true`, and the
 * caller exposes {@link recoverCursor} to reset the infinite query to its
 * first page while preserving filters. A malformed response hands the user
 * the same explicit recovery path.
 */
export function useInfiniteConfessions(
  params: Omit<GetConfessionsParams, "page"> = {},
) {
  const { limit = DEFAULT_LIMIT, ...rest } = params;
  const [cursorExpired, setCursorExpired] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = [...queryKeys.confessions.list(rest), "infinite", { limit }];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      const result = await getConfessions({
        page: pageParam as number,
        limit,
        ...rest,
      });
      if (!result.ok) {
        const err = new QueryError(result.error);
        if (isPaginationCursorExpired(err)) {
          setCursorExpired(true);
        }
        throw err;
      }
      return result.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return (lastPage.page ?? 1) + 1;
      }
      return undefined;
    },
    // Keep previously loaded pages visible while a background refetch (or a
    // retry after a transient failure) is in flight instead of wiping them.
    placeholderData: (previousData) => previousData,
    // A cursor-expired response is not transient and must not retry: the
    // server answer will be the same until we send a different cursor, so a
    // retry loop would just burn battery and rate limits. Other transient
    // errors retry as before.
    retry: (failureCount, error) => {
      if (isPaginationCursorExpired(error)) return false;
      return retryOnTransientError(failureCount, error);
    },
    retryDelay: exponentialBackoff,
  });

  /**
   * Wipe the cached pages for this query and refetch from the first page,
   * keeping filters intact. Call from the recovery banner surfaced to the
   * user when {@link cursorExpired} is true.
   */
  const recoverCursor = useCallback(async () => {
    setCursorExpired(false);
    queryClient.removeQueries({ queryKey, exact: true });
    await query.refetch();
  }, [queryClient, queryKey, query]);

  return { ...query, cursorExpired, recoverCursor };
}

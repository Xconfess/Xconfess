"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getConfessions } from "@/app/lib/api/confessions";
import type { GetConfessionsParams } from "@/app/lib/api/confessions";
import { queryKeys } from "@/app/lib/api/queryKeys";

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
        throw new Error(result.error.message);
      }
      return result.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook for infinite-scroll loading of confessions using cursor-based pagination.
 * Automatically fetches the next page when `fetchNextPage` is called.
 */
export function useInfiniteConfessions(
  params: Omit<GetConfessionsParams, "page"> = {},
) {
  const { limit = DEFAULT_LIMIT, ...rest } = params;

  return useInfiniteQuery({
    queryKey: [...queryKeys.confessions.list(rest), "infinite", { limit }],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await getConfessions({
        page: pageParam as number,
        limit,
        ...rest,
      });
      if (!result.ok) {
        throw new Error(result.error.message);
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
  });
}

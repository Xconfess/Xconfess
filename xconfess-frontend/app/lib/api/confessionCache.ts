import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type {
  GetConfessionByIdResult,
  GetConfessionsResult,
} from "@/app/lib/api/confessions";
import { queryKeys } from "@/app/lib/api/queryKeys";
import type { NormalizedConfession } from "@/app/lib/utils/normalizeConfession";

export type QuerySnapshot = [QueryKey, unknown];

type ConfessionCacheRecord = GetConfessionByIdResult | NormalizedConfession;

function isInfiniteConfessionsResult(
  value: unknown,
): value is InfiniteData<GetConfessionsResult> {
  return (
    typeof value === "object" &&
    value !== null &&
    "pages" in value &&
    Array.isArray((value as InfiniteData<GetConfessionsResult>).pages)
  );
}

function isConfessionCacheRecord(value: unknown): value is ConfessionCacheRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as ConfessionCacheRecord).id === "string"
  );
}

export function snapshotConfessionQueries(
  queryClient: QueryClient,
): QuerySnapshot[] {
  return queryClient.getQueriesData({ queryKey: queryKeys.confessions.all });
}

export function restoreQuerySnapshots(
  queryClient: QueryClient,
  snapshots: QuerySnapshot[] | undefined,
) {
  snapshots?.forEach(([queryKey, data]) => {
    queryClient.setQueryData(queryKey, data);
  });
}

export function updateConfessionQueries(
  queryClient: QueryClient,
  confessionId: string,
  updater: (confession: ConfessionCacheRecord) => ConfessionCacheRecord,
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.confessions.all },
    (current: unknown) => {
      if (isInfiniteConfessionsResult(current)) {
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            confessions: page.confessions.map((confession) =>
              confession.id === confessionId ? updater(confession) : confession,
            ),
          })),
        };
      }

      if (isConfessionCacheRecord(current) && current.id === confessionId) {
        return updater(current);
      }

      return current;
    },
  );
}

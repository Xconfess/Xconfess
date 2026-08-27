import { useEffect, useState } from "react";
import apiClient from "@/app/lib/api/client";
import { getErrorMessage } from "@/app/lib/utils/errorHandler";

import { RawConfession } from "../utils/normalizeConfession";

export const useConfessions = () => {
  const [data, setData] = useState<RawConfession[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; correlationId?: string } | null>(null);
  const [hasMore, setHasMore] = useState(true); // ✅ track if more pages exist

  useEffect(() => {
    const fetchConfessions = async () => {
      if (!hasMore && page !== 1) return; // Stop fetching if no more pages

      try {
        setLoading(true);
        setError(null);

        const res = await apiClient.get(`/confessions?page=${page}&limit=10`);
        const confessions = res.data.confessions || [];
        const meta = res.data.meta || { hasMore: false };

        setData((prev) =>
          page === 1 ? confessions : [...prev, ...confessions],
        );
        setHasMore(meta.hasMore ?? false);
      } catch (err: any) {
        const message = getErrorMessage(err);
        const correlationId = err.response?.data?.correlationId || err.config?.correlationId || err.correlationId;
        setError({ message, correlationId });
      } finally {
        setLoading(false);
      }
    };

    fetchConfessions();
  }, [page, hasMore]);

  const fetchNextPage = () => {
    if (hasMore) setPage((prev) => prev + 1);
  };

  return { data, loading, error, fetchNextPage, hasMore, setPage };
};

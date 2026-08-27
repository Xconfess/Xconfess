"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface PaginationState {
  page: number;
  limit: number;
}

export function usePaginationState(defaultLimit = 10) {
  const router = useRouter();
  const pathname = usePathname();
  const [queryString, setQueryString] = useState("");
  const searchParams = useMemo(
    () => new URLSearchParams(queryString),
    [queryString],
  );

  useEffect(() => {
    setQueryString(window.location.search);
  }, [pathname]);

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.max(
    1,
    parseInt(searchParams.get("limit") ?? String(defaultLimit)) || defaultLimit,
  );

  const pushParams = useCallback(
    (params: URLSearchParams) => {
      const nextQueryString = params.toString();
      setQueryString(nextQueryString ? `?${nextQueryString}` : "");
      router.push(`${pathname}${nextQueryString ? `?${nextQueryString}` : ""}`, {
        scroll: false,
      });
    },
    [router, pathname],
  );

  const setPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(newPage));
      }
      pushParams(params);
    },
    [searchParams, pushParams],
  );

  const setLimit = useCallback(
    (newLimit: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("limit", String(newLimit));
      params.delete("page");
      pushParams(params);
    },
    [searchParams, pushParams],
  );

  return {
    page,
    limit,
    setPage,
    setLimit,
  };
}

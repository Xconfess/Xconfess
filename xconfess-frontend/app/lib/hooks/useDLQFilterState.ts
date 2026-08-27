"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export interface DLQFilterState {
  page: number;
  statusFilter: "failed" | "all";
  startDate: string;
  endDate: string;
  minRetries: number | undefined;
  setPage: (page: number) => void;
  setStatusFilter: (status: "failed" | "all") => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setMinRetries: (retries: number | undefined) => void;
}

export function useDLQFilterState(): DLQFilterState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const rawStatus = searchParams.get("status");
  const statusFilter: "failed" | "all" = rawStatus === "all" ? "all" : "failed";
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";
  const rawMinRetries = searchParams.get("minRetries");
  const minRetries: number | undefined =
    rawMinRetries !== null ? parseInt(rawMinRetries, 10) : undefined;

  const applyParams = useCallback(
    (updates: Record<string, string | null>, resetPage = false) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if (resetPage) {
        params.delete("page");
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setPage = useCallback(
    (newPage: number) => {
      applyParams({ page: newPage <= 1 ? null : String(newPage) });
    },
    [applyParams]
  );

  const setStatusFilter = useCallback(
    (status: "failed" | "all") => {
      applyParams({ status: status === "failed" ? null : status }, true);
    },
    [applyParams]
  );

  const setStartDate = useCallback(
    (date: string) => {
      applyParams({ startDate: date || null }, true);
    },
    [applyParams]
  );

  const setEndDate = useCallback(
    (date: string) => {
      applyParams({ endDate: date || null }, true);
    },
    [applyParams]
  );

  const setMinRetries = useCallback(
    (retries: number | undefined) => {
      applyParams(
        { minRetries: retries !== undefined ? String(retries) : null },
        true
      );
    },
    [applyParams]
  );

  return {
    page,
    statusFilter,
    startDate,
    endDate,
    minRetries,
    setPage,
    setStatusFilter,
    setStartDate,
    setEndDate,
    setMinRetries,
  };
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNetwork } from "@/app/lib/providers/NetworkStatusProvider";
import { WifiOff, AlertTriangle, ServerOff, RefreshCcw, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const NetworkBanner = () => {
  const { isOnline, isDegraded, isApiOnline, checkApiStatus } = useNetwork();
  const queryClient = useQueryClient();
  const [isVisible, setIsVisible] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [offlineReason, setOfflineReason] = useState<"browser" | "api" | "degraded" | null>(null);

  useEffect(() => {
    if (!isOnline) {
      setOfflineReason("browser");
      setIsVisible(true);
    } else if (!isApiOnline) {
      setOfflineReason("api");
      setIsVisible(true);
    } else if (isDegraded) {
      setOfflineReason("degraded");
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setOfflineReason(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, isDegraded, isApiOnline]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    if (offlineReason === "api" || offlineReason === "degraded") {
      const ok = await checkApiStatus();
      if (ok) {
        queryClient.invalidateQueries();
      }
    } else if (typeof window !== "undefined" && "navigator" in window) {
      if (navigator.onLine) {
        const ok = await checkApiStatus();
        if (ok) {
          queryClient.invalidateQueries();
        }
      }
    }
    setIsRetrying(false);
  }, [offlineReason, checkApiStatus, queryClient]);

  if (!isVisible) return null;

  const icon = offlineReason === "browser" ? WifiOff : offlineReason === "api" ? ServerOff : AlertTriangle;
  const Icon = icon;

  const bannerTitle = {
    browser: "You're offline",
    api: "Backend unreachable",
    degraded: "Unstable connection",
  }[offlineReason!];

  const bannerText = {
    browser: "Check your internet connection.",
    api: "The backend server is not responding. Retry when back online.",
    degraded: "Some features may be limited.",
  }[offlineReason!];

  return (
    <div className="fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 transition-all duration-300 ease-out">
      <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-[0_12px_30px_-24px_rgba(20,16,30,0.55)]">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1.5 text-[var(--secondary)]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-grow min-w-0">
            <p className="text-sm font-semibold leading-tight">{bannerTitle}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-[var(--secondary)]">{bannerText}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:opacity-50"
              >
                <RefreshCcw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
                {isRetrying ? "Checking..." : "Retry"}
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="min-h-8 px-1 text-[11px] font-medium text-[var(--secondary)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity p-0.5"
            aria-label="Close connection notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

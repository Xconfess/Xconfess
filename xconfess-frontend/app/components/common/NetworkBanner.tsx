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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm transition-all duration-500 ease-out">
      <div className={`relative overflow-hidden rounded-xl border p-3 shadow-2xl backdrop-blur-md ${
        offlineReason === "browser"
          ? "bg-red-500/10 border-red-500/20 text-red-200"
          : offlineReason === "api"
            ? "bg-orange-500/10 border-orange-500/20 text-orange-200"
            : "bg-amber-500/10 border-amber-500/20 text-amber-200"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 rounded-lg p-1.5 ${
            offlineReason === "browser" ? "bg-red-500/20" : offlineReason === "api" ? "bg-orange-500/20" : "bg-amber-500/20"
          }`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-grow min-w-0">
            <p className="font-semibold text-sm leading-tight">{bannerTitle}</p>
            <p className="text-[11px] opacity-70 mt-0.5 leading-tight">{bannerText}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  offlineReason === "browser"
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20"
                    : offlineReason === "api"
                      ? "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20"
                      : "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20"
                } disabled:opacity-50`}
              >
                <RefreshCcw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
                {isRetrying ? "Checking..." : "Retry"}
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="text-[11px] font-medium opacity-60 hover:opacity-100 transition-opacity"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

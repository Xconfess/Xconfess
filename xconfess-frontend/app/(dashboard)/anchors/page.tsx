"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ExternalLink,
  Anchor,
  Loader2,
  AlertCircle,
  Inbox,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { fetchUserAnchors } from "@/app/lib/api/stellar";
import { getStellarExplorerUrl } from "@/app/lib/utils/stellar";

type AnchorStatus = "pending" | "confirmed" | "failed" | "stale";

interface AnchorItem {
  confessionId: string;
  anchoredAt: string;
  contractId: string;
  stellarTxHash?: string;
  status?: AnchorStatus;
}

export default function AnchorsPage() {
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["user-anchors", page, limit],
    queryFn: () => fetchUserAnchors(page, limit),
  });

  const totalPages = data?.meta?.totalPages ?? 0;

  const renderStatusBadge = (status: AnchorStatus = "confirmed") => {
    switch (status) {
      case "confirmed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3" /> Confirmed
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3 animate-pulse" /> Pending
          </span>
        );
      case "stale":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <AlertTriangle className="w-3 h-3" /> Stale
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3 mb-8">
        <Anchor className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          My On-Chain Anchors
        </h1>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-[var(--secondary)]">
            Loading anchors...
          </span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-[var(--secondary)] mb-4">
            {error instanceof Error
              ? error.message
              : "Failed to load anchors"}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && data && data.data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox className="w-16 h-16 text-[var(--secondary)] mb-4" />
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
            No anchors yet
          </h2>
          <p className="text-[var(--secondary)] max-w-md">
            Confessions you anchor on the Stellar blockchain will appear here.
            Anchor a confession from its detail page to get started.
          </p>
        </div>
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <>
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                      Confession ID
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                      Anchored At
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">
                      Contract ID
                    </th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-gray-700">
                      Explorer / Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.data.map((anchor: AnchorItem) => {
                    const status = anchor.status || "confirmed";
                    return (
                      <tr
                        key={anchor.confessionId}
                        className="hover:bg-gray-50 transition"
                      >
                        <td className="px-6 py-4">
                          <code className="text-xs font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
                            {anchor.confessionId.substring(0, 8)}...
                          </code>
                        </td>
                        <td className="px-6 py-4">
                          {renderStatusBadge(status)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {new Date(anchor.anchoredAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">
                            {anchor.contractId.substring(0, 12)}...
                          </code>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {anchor.stellarTxHash ? (
                            <a
                              href={getStellarExplorerUrl(anchor.stellarTxHash) as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              View
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (status === "stale" || status === "failed") ? (
                            <button
                              onClick={() => {
                                // Trigger retry action or refetch
                                refetch();
                              }}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                            >
                              <RefreshCw className="w-3 h-3" /> Retry
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Processing</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-[var(--secondary)]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
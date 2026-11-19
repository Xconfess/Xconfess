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
import { EmptyState } from "@/components/ui/empty-state";

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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--success)]/10 text-[var(--foreground)]">
            <CheckCircle2 className="w-3 h-3" /> Confirmed
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-soft)] text-[var(--primary-deep)]">
            <Clock className="w-3 h-3 animate-pulse" /> Pending
          </span>
        );
      case "stale":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--warning)]/10 text-[var(--foreground)]">
            <AlertTriangle className="w-3 h-3" /> Stale
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--danger)]/10 text-[var(--foreground)]">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3 mb-8">
        <Anchor className="w-6 h-6 text-[var(--primary-deep)]" />
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          My On-Chain Anchors
        </h1>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-deep)]" />
          <span className="ml-3 text-[var(--secondary)]">
            Loading anchors...
          </span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-[var(--danger)] mb-4" />
          <p className="text-[var(--secondary)] mb-4">
            {error instanceof Error
              ? error.message
              : "Failed to load anchors"}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] transition"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && data && data.data.length === 0 && (
        <EmptyState
          className="py-20"
          icon={<Inbox className="w-16 h-16 text-[var(--secondary)]" />}
          title="No anchors yet"
          description="Confessions you anchor on the Stellar blockchain will appear here. Anchor a confession from its detail page to get started."
        />
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <>
          <div className="bg-[var(--surface)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--secondary)]">
                      Confession ID
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--secondary)]">
                      Status
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--secondary)]">
                      Anchored At
                    </th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--secondary)]">
                      Contract ID
                    </th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-[var(--secondary)]">
                      Explorer / Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.data.map((anchor: AnchorItem) => {
                    const status = anchor.status || "confirmed";
                    return (
                      <tr
                        key={anchor.confessionId}
                        className="hover:bg-[var(--surface-muted)] transition"
                      >
                        <td className="px-6 py-4">
                          <code className="text-xs font-mono text-[var(--foreground)] bg-[var(--surface-muted)] px-2 py-1 rounded">
                            {anchor.confessionId.substring(0, 8)}...
                          </code>
                        </td>
                        <td className="px-6 py-4">
                          {renderStatusBadge(status)}
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--secondary)]">
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
                          <code className="text-xs font-mono text-[var(--secondary)] bg-[var(--surface-muted)] px-2 py-1 rounded">
                            {anchor.contractId.substring(0, 12)}...
                          </code>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {anchor.stellarTxHash ? (
                            <a
                              href={getStellarExplorerUrl(anchor.stellarTxHash) as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--primary-deep)] hover:text-[var(--primary-deep)] text-sm font-medium"
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
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition"
                            >
                              <RefreshCw className="w-3 h-3" /> Retry
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">Processing</span>
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
                className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg border border-[var(--accent-border)] bg-[var(--surface)] text-[var(--secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition"
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
                className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg border border-[var(--accent-border)] bg-[var(--surface)] text-[var(--secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition"
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
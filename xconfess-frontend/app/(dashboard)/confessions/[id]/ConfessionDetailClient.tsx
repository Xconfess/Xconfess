"use client";

import { useQuery } from "@tanstack/react-query";
import { readRetryDelay, shouldRetryRead } from "@/app/lib/api/readRetry";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  RefreshCw,
  FileQuestion,
  Link2,
  ShieldCheck,
  ShieldQuestion,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { ReactionButton } from "@/app/components/confession/ReactionButtons";
import { AnchorButton } from "@/app/components/confession/AnchorButton";
import { TipButton } from "@/app/components/confession/TipButton";
import { ShareButton } from "@/app/components/confession/ShareButton";
import { CommentSection } from "@/app/components/confession/CommentSection";
import { RelatedConfessions } from "@/app/components/confession/RelatedConfessions";
import { formatDate } from "@/app/lib/utils/formatDate";
import { sanitizeMarkdown } from "@/app/lib/utils/markdown";
import { cn } from "@/app/lib/utils/cn";
import { focusVisible } from "@/app/lib/utils/focusStyles";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { useAuth } from "@/app/lib/hooks/useAuth";
import { getConfessionById } from "@/app/lib/api/confessions";
import { createConfessionReport } from "@/app/lib/api/reports";

interface ConfessionDetailClientProps {
  initialConfession: {
    id: string;
    content: string;
    createdAt: string;
    viewCount: number;
    reactions: { like: number; love: number };
    commentCount?: number;
    isAnchored?: boolean;
    stellarTxHash?: string | null;
    anchorStatus?: "confirmed" | "pending" | "not_anchored";
    author?: { id: string; username?: string; avatar?: string | null; stellarAddress?: string };
  } | null; // Changed to allow null for explicit 404 tracking
  confessionId: string;
}

export function ConfessionDetailClient({
  initialConfession,
  confessionId,
}: ConfessionDetailClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [reportStatus, setReportStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [reportError, setReportError] = useState<string | null>(null);

  // Core data hook setup modified to catch distinct error streams
  const {
    data: confession,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.confessions.detail(confessionId),
    queryFn: async ({ signal }) => {
      const result = await getConfessionById(confessionId, signal);

      // The request was cancelled because confessionId changed (navigated to
      // another confession) or this component unmounted. Rethrow the abort
      // as-is so React Query's own cancellation handling recognizes it and
      // discards the result instead of surfacing it as a NETWORK_FAILURE
      // error state for a request nobody is waiting on anymore.
      if (!result.ok && signal.aborted) {
        throw new DOMException("Request was cancelled.", "AbortError");
      }

      // Explicit 404 check mapping using the error object parameters
      if (
        !result.ok &&
        result.error &&
        "status" in result.error &&
        result.error.status === 404
      ) {
        throw new Error("NOT_FOUND");
      }

      if (!result.ok) {
        throw new Error("NETWORK_FAILURE");
      }
      return result.data;
    },
    initialData: initialConfession ?? undefined,
    retry: shouldRetryRead,
    retryDelay: readRetryDelay,
  });

  const submitReport = async () => {
    if (reportStatus === "pending" || reportStatus === "success") return;

    setReportStatus("pending");
    setReportError(null);

    try {
      const result = await createConfessionReport(confessionId, {
        type: "other",
      });

      if (result.ok) {
        setReportStatus("success");
      } else {
        setReportStatus("error");
        setReportError(result.error.message);
      }
    } catch (err) {
      setReportStatus("error");
      setReportError(
        err instanceof Error ? err.message : "Report submission failed.",
      );
    }
  };

  // ==========================================
  // STATE 1: REUSABLE STABLE LAYOUT SKELETON
  // ==========================================
  if (isLoading && !confession) {
    return (
      <div className="min-h-screen animate-pulse">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
          {/* Breadcrumb Skeleton */}
          <div className="mb-6 flex items-center gap-4 h-9">
            <div className="h-8 w-16 bg-[var(--skeleton)] rounded" />
            <div className="h-4 w-32 bg-[var(--skeleton)] rounded" />
          </div>

          {/* Main Card Layout Mimic Block */}
          <Card className="mb-8 border border-[var(--border)]">
            <CardHeader className="pb-4">
              <div className="h-4 w-40 bg-[var(--skeleton)] rounded" />
            </CardHeader>
            <CardContent>
              {/* Main text content layout mocks */}
              <div className="space-y-3">
                <div className="h-5 w-full bg-[var(--skeleton)] rounded" />
                <div className="h-5 w-11/12 bg-[var(--skeleton)] rounded" />
                <div className="h-5 w-4/5 bg-[var(--skeleton)] rounded" />
              </div>

              {/* Action Rows explicitly matched to prevent overlap jumps */}
              <div className="mt-6 pt-6 border-t border-[var(--border)] flex items-center justify-between">
                <div className="flex gap-3">
                  <div className="h-9 w-16 bg-[var(--skeleton)] rounded-full" />
                  <div className="h-9 w-16 bg-[var(--skeleton)] rounded-full" />
                  <div className="h-9 w-24 bg-[var(--skeleton)] rounded-full" />
                </div>
                <div className="h-9 w-12 bg-[var(--skeleton)] rounded-full" />
              </div>
            </CardContent>
          </Card>

          {/* Report Pin Skeleton */}
          <div className="mb-8 flex justify-end">
            <div className="h-8 w-20 bg-[var(--skeleton)] rounded" />
          </div>

          {/* Comment Thread Skeleton block layout */}
          <div className="mb-10 p-4 border border-[var(--border)] rounded-xl space-y-4">
            <div className="h-10 w-full bg-[var(--skeleton)] rounded-lg" />
            <div className="space-y-2 pt-2">
              <div className="h-4 w-1/4 bg-[var(--skeleton)] rounded" />
              <div className="h-4 w-full bg-[var(--skeleton)] rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // STATE 2: DISTINCT NOT FOUND (404) BOUNDARY
  // ==========================================
  if (isError && error?.message === "NOT_FOUND") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full border border-[var(--border)] text-center p-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-[var(--warning)]/10 flex items-center justify-center mb-4">
            <FileQuestion className="h-6 w-6 text-[var(--warning)]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Confession Missing
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            The record you are looking for does not exist in our cryptographic
            memory database. It may have been retracted or modified.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/")}
            >
              Back to Feed
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ==========================================
  // STATE 3: DISTINCT NETWORK FAILURE BOUNDARY
  // ==========================================
  if (isError || !confession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full border border-[var(--border)] text-center p-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-[var(--danger)]/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-6 w-6 text-[var(--danger)]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Connection Interrupted
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Could not fetch data from Xconfess server network. Check your data
            stream and reload.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="default"
              size="sm"
              onClick={() => void refetch()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Connection
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const dateLabel = formatDate(new Date(confession.createdAt));
  const anchorStatus =
    confession.anchorStatus ??
    (confession.isAnchored
      ? "confirmed"
      : confession.stellarTxHash
        ? "pending"
        : "not_anchored");
  const AnchorIcon =
    anchorStatus === "confirmed"
      ? ShieldCheck
      : anchorStatus === "pending"
        ? Timer
        : ShieldQuestion;
  const anchorLabel =
    anchorStatus === "confirmed"
      ? "Verified on-chain"
      : anchorStatus === "pending"
        ? "Anchor pending"
        : "Not anchored";

  // ==========================================
  // STATE 4: STANDARD RENDER DATA SUITE
  // ==========================================
  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {/* Navigation: Back + Breadcrumbs */}
        <nav
          className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 text-sm"
          aria-label="Breadcrumb"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="self-start gap-2 -ml-2"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <ol className="flex items-center gap-2 text-[var(--text-muted)]">
            <li>
              <Link
                href="/"
                className={cn(
                  "text-[var(--text-muted)] hover:text-[var(--secondary)] transition-colors",
                  focusVisible,
                )}
              >
                Feed
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="h-4 w-4" />
            </li>
            <li className="text-[var(--secondary)] truncate max-w-50" aria-current="page">
              Confession
            </li>
          </ol>
        </nav>

        {/* Main confession card */}
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
              <time dateTime={confession.createdAt}>{dateLabel}</time>
              {confession.viewCount != null && confession.viewCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  {confession.viewCount} views
                </span>
              )}
              <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">
                <AnchorIcon className="h-3.5 w-3.5" />
                {anchorLabel}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-w-[65ch] whitespace-pre-line break-words font-editorial text-[1.1875rem] leading-[1.7] text-[var(--foreground)] [&_a]:break-all [&_a]:text-[var(--primary-deep)] [&_a]:underline [&_p+p]:mt-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sanitizeMarkdown(confession.content)}
              </ReactMarkdown>
            </div>

            {/* Reactions + Anchor + Share */}
            <div className="mt-6 pt-6 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <ReactionButton
                  type="like"
                  count={confession.reactions.like}
                  confessionId={confessionId}
                />
                <ReactionButton
                  type="love"
                  count={confession.reactions.love}
                  confessionId={confessionId}
                />
                <TipButton
                  confessionId={confessionId}
                  recipientAddress={confession.author?.stellarAddress}
                />
                <AnchorButton
                  confessionId={confessionId}
                  confessionContent={confession.content}
                  isAnchored={confession.isAnchored}
                  stellarTxHash={confession.stellarTxHash}
                  onAnchorSuccess={() => {
                    void refetch();
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                {confession.stellarTxHash && (
                  <span className="hidden items-center gap-1 text-xs text-[var(--text-muted)] sm:inline-flex">
                    <Link2 className="h-3.5 w-3.5" />
                    {confession.stellarTxHash.slice(0, 8)}...
                  </span>
                )}
                <ShareButton confessionId={confessionId} variant="dropdown" />
              </div>
            </div>

            {/* Comment count link */}
            {(confession.commentCount ?? 0) > 0 && (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                💬 {confession.commentCount} comment
                {(confession.commentCount ?? 0) !== 1 ? "s" : ""}
              </p>
            )}

            {isFetching && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Updating…</p>
            )}
          </CardContent>
        </Card>

        {/* Report Section */}
        <div className="mb-8 flex justify-end">
          <div className="flex flex-col items-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--text-muted)] hover:text-[var(--text-muted)]"
              disabled={
                reportStatus === "pending" || reportStatus === "success"
              }
              onClick={submitReport}
              aria-label="Report confession"
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              {reportStatus === "pending"
                ? "Reporting..."
                : reportStatus === "success"
                  ? "Reported"
                  : "Report"}
            </Button>

            {reportStatus === "pending" && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Submitting report…</p>
            )}
            {reportStatus === "success" && (
              <p className="mt-2 text-xs text-[var(--success)]">
                Report submitted. Thank you!
              </p>
            )}
            {reportStatus === "error" && (
              <p className="mt-2 text-xs text-[var(--danger)]">
                {reportError || "Report submission failed."}
              </p>
            )}
          </div>
        </div>

        {/* Comments Section Container */}
        <div className="mb-10">
          <CommentSection
            confessionId={confessionId}
            isAuthenticated={!!user}
            onLoginPrompt={() => router.push("/login")}
          />
        </div>

        {/* Related confessions */}
        <RelatedConfessions currentId={confessionId} className="mb-8" />
      </div>
    </div>
  );
}

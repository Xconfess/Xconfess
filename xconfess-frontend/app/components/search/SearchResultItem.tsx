"use client";

import Link from "next/link";
import { Eye, Heart, MessageSquare, Anchor, ExternalLink } from "lucide-react";
import type { SearchConfession } from "@/app/lib/types/search";
import { cn } from "@/app/lib/utils/cn";
import { getStellarExplorerUrl } from "@/app/lib/utils/stellar";

interface SearchResultItemProps {
  confession: SearchConfession;
  searchQuery?: string;
  className?: string;
}

function timeAgo(date: string) {
  const ts = new Date(date).getTime();
  if (Number.isNaN(ts)) return "Unknown date";

  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 0) {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function highlightFragments(
  text: string,
  query: string
): Array<{ highlight: boolean; text: string }> {
  const q = query.trim().toLowerCase();
  if (!q || !text) {
    return [{ highlight: false, text }];
  }

  const lower = text.toLowerCase();
  const result: Array<{ highlight: boolean; text: string }> = [];
  let last = 0;
  let idx = lower.indexOf(q);

  while (idx !== -1) {
    if (idx > last) {
      result.push({ highlight: false, text: text.slice(last, idx) });
    }
    result.push({ highlight: true, text: text.slice(idx, idx + q.length) });
    last = idx + q.length;
    idx = lower.indexOf(q, last);
  }

  if (last < text.length) {
    result.push({ highlight: false, text: text.slice(last) });
  }

  return result;
}

function HighlightedContent({
  content,
  query,
  className,
}: {
  content: string;
  query?: string;
  className?: string;
}) {
  const fragments = highlightFragments(content, query ?? "");
  return (
    <p className={cn("leading-8 text-[var(--foreground)] line-clamp-3", className)}>
      {fragments.map((f, i) =>
        f.highlight ? (
          <mark
            key={i}
            className="rounded px-1 py-0.5 font-medium text-[var(--foreground)]"
            style={{ backgroundColor: "var(--accent-soft)" }}
          >
            {f.text}
          </mark>
        ) : (
          <span key={i}>{f.text}</span>
        )
      )}
    </p>
  );
}

export function SearchResultItem({
  confession,
  searchQuery,
  className,
}: SearchResultItemProps) {
  const totalReactions =
    confession.reactions.like + confession.reactions.love;
  const explorerUrl = getStellarExplorerUrl(confession.stellarTxHash);

  return (
    <Link
      href={`/confessions/${confession.id}`}
      className={cn(
        "luxury-panel block rounded-[28px] p-5 transition-colors hover:bg-[var(--surface-strong)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        className
      )}
      data-testid="search-result-item"
    >
      <HighlightedContent
        content={confession.content}
        query={searchQuery}
        className="mb-4 font-editorial text-2xl"
      />
      <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--secondary)]">
        <span>{timeAgo(confession.createdAt)}</span>
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-4 w-4" />
          {totalReactions} reactions
        </span>
        {confession.commentCount != null && (
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            {confession.commentCount}
          </span>
        )}
        {confession.viewCount != null && (
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-4 w-4" />
            {confession.viewCount}
          </span>
        )}
        {confession.isAnchored && (
          <span className="inline-flex items-center gap-1 text-green-600">
            <Anchor className="h-4 w-4" />
            Anchored
          </span>
        )}
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            Explorer
          </a>
        )}
      </div>
    </Link>
  );
}

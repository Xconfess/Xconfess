"use client";

import { type Comment } from "@/app/lib/types/confession";
import { formatDate } from "@/app/lib/utils/formatDate";
import { MessageCircle } from "lucide-react";

interface CommentItemProps {
  comment: Comment;
  onReply?: (comment: Comment) => void;
  isReply?: boolean;
}

export function CommentItem({
  comment,
  onReply,
  isReply = false,
}: CommentItemProps) {
  const date =
    typeof comment.createdAt === "string"
      ? formatDate(new Date(comment.createdAt))
      : formatDate(new Date());

  return (
    <article
      className={`min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 p-3 sm:p-4 ${isReply ? "ml-3 border-l-2 border-l-[var(--border)] pl-3 sm:ml-6 sm:pl-4" : ""
        } ${comment.isOptimistic ? "opacity-80" : ""}`}
      data-comment-id={comment.id}
      aria-label={`Comment by ${comment.author || "Anonymous"}`}
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="min-w-0 max-w-full break-words text-sm font-medium text-[var(--text-muted)] [overflow-wrap:anywhere]">
            {comment.author || "Anonymous"}
          </span>
          {comment.isOptimistic && (
            <span
              className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]"
              role="status"
            >
              Sending
            </span>
          )}
        </div>
        <time
          className="shrink-0 text-xs text-[var(--text-muted)]"
          dateTime={
            typeof comment.createdAt === "string"
              ? comment.createdAt
              : new Date().toISOString()
          }
        >
          {date}
        </time>
      </div>
      <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)] [overflow-wrap:anywhere]">
        {comment.content}
      </p>
      {onReply && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded px-1"
            aria-label={`Reply to comment by ${comment.author || "Anonymous"}`}
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Reply</span>
          </button>
        </div>
      )}
    </article>
  );
}
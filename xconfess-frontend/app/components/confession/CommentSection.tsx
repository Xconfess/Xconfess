"use client";

import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { CommentItem } from "./CommentItem";
import { CommentSectionSkeleton } from "./LoadingSkeleton";
import {
  useCommentsQuery,
  useCreateCommentMutation,
} from "@/app/lib/hooks/useComments";
import { type Comment } from "@/app/lib/types/confession";
import { InlineError } from "@/app/components/common/InlineError";
import { AppError } from "@/app/lib/utils/errorHandler";

function getRateLimitAwareMessage(error: unknown): string {
  if (error instanceof AppError && error.statusCode === 429) {
    const retryAfter = typeof error.details?.retryAfter === 'number' ? error.details.retryAfter : null;
    if (retryAfter && retryAfter > 0) {
      const seconds = Math.ceil(retryAfter);
      return `You are commenting too quickly. Please wait ${seconds} second${seconds === 1 ? '' : 's'} and try again.`;
    }
    return "You are commenting too quickly. Please wait a moment and try again.";
  }
  return error instanceof Error ? error.message : "Failed to post comment";
}

interface CommentSectionProps {
  confessionId: string;
  isAuthenticated?: boolean;
  onLoginPrompt?: () => void;
}

export function CommentSection({
  confessionId,
  isAuthenticated = false,
  onLoginPrompt,
}: CommentSectionProps) {
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    comments,
    error,
    fetchNextPage,
    hasMore,
    isFetchingNextPage,
    isFetchNextPageError,
    loading,
    refetch,
  } = useCommentsQuery(confessionId);
  const createCommentMutation = useCreateCommentMutation(confessionId);

  const topLevelComments = useMemo(
    () => comments.filter((comment) => comment.parentId == null),
    [comments],
  );

  function renderReplies(parentId: number, depth = 1) {
    if (depth > 6) return null;

    const parent = comments.find((comment) => comment.id === parentId);
    const attachedReplies = parent?.replies ?? [];
    const nestedReplies =
      attachedReplies.length > 0
        ? attachedReplies
        : comments.filter((comment) => comment.parentId === parentId);

    if (nestedReplies.length === 0) {
      return null;
    }

    return (
      <ul className="mt-3 min-w-0 list-none space-y-3 p-0" role="list">
        {nestedReplies.map((reply) => (
          <li key={reply.id} className="min-w-0">
            <CommentItem comment={reply} onReply={handleReply} isReply />
            {renderReplies(reply.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  }

  const handleReply = (comment: Comment) => {
    setReplyTo(comment);
    setContent(`@${comment.author || "Anonymous"} `);
    document.getElementById("comment-form")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (createCommentMutation.isPending) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    if (!isAuthenticated) {
      onLoginPrompt?.();
      return;
    }

    setSubmitError(null);

    try {
      await createCommentMutation.mutateAsync({
        content: trimmed,
        anonymousContextId: "",
        parentId: replyTo?.id ?? null,
      });

      setContent("");
      setReplyTo(null);
    } catch (mutationError) {
      setSubmitError(getRateLimitAwareMessage(mutationError));
    }
  };

  return (
    <section
      id="comments"
      className="max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3 sm:p-6"
      aria-labelledby="comments-heading"
    >
      <h2
        id="comments-heading"
        className="mb-4 text-lg font-semibold text-[var(--foreground)]"
      >
        Comments ({comments.length})
      </h2>

      <form
        id="comment-form"
        onSubmit={handleSubmit}
        className="mb-6"
        aria-label="Add a comment"
      >
        {replyTo && (
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded bg-[var(--surface-muted)]/50 px-3 py-2 text-sm text-[var(--text-muted)]" role="status">
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              Replying to {replyTo.author || "Anonymous"}
            </span>
            <button
              type="button"
              onClick={() => {
                setReplyTo(null);
                setContent("");
              }}
              className="min-h-10 shrink-0 touch-manipulation text-[var(--text-muted)] hover:text-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded px-1"
              aria-label="Cancel reply"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label
            htmlFor="comment-body"
            className="sr-only"
          >
            {replyTo
              ? `Reply to ${replyTo.author || 'Anonymous'}`
              : 'Comment'}
          </label>
          <textarea
            id="comment-body"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              isAuthenticated ? "Write a comment..." : "Sign in to comment"
            }
            disabled={!isAuthenticated}
            rows={3}
            className="min-h-20 w-full min-w-0 resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-[var(--foreground)] placeholder-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60"
            maxLength={2000}
            aria-describedby="char-count-info"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span id="char-count-info" className="text-xs text-[var(--text-muted)]" aria-live="polite">
            {content.length}/2000 characters
          </span>
          <Button
            type="submit"
            disabled={
              createCommentMutation.isPending ||
              !content.trim() ||
              !isAuthenticated
            }
            size="sm"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            aria-busy={createCommentMutation.isPending}
          >
            {createCommentMutation.isPending ? "Posting..." : "Post comment"}
          </Button>
        </div>

        <InlineError message={submitError} className="mt-2" />
      </form>

      {loading && comments.length === 0 && (
        <div role="status" aria-label="Loading comments...">
          <CommentSectionSkeleton />
        </div>
      )}

      {!loading && error && comments.length === 0 && (
        <div
          className="rounded-lg border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)]"
          role="alert"
        >
          <p>{error.message || "Failed to load comments"}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            onClick={() => {
              void refetch();
            }}
            disabled={loading}
          >
            Try again
          </Button>
        </div>
      )}

      {comments.length > 0 && (
        <>
          <ul className="m-0 min-w-0 list-none space-y-3 p-0" role="list">
            {topLevelComments.map((comment) => (
              <li key={comment.id} className="min-w-0">
                <CommentItem
                  comment={comment}
                  onReply={handleReply}
                  isReply={false}
                />
                {renderReplies(comment.id, 1)}
              </li>
            ))}
          </ul>

          {isFetchNextPageError && (
            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]"
              role="alert"
            >
              <p>Couldn&apos;t load more comments. Your loaded comments are still here.</p>
              <Button
                variant="outline"
                size="sm"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                onClick={() => {
                  void fetchNextPage();
                }}
                disabled={isFetchingNextPage}
              >
                Try again
              </Button>
            </div>
          )}

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void fetchNextPage();
                }}
                disabled={isFetchingNextPage}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-busy={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load more comments"}
              </Button>
            </div>
          )}
        </>
      )}

      {!loading && !error && comments.length === 0 && (
        <p className="py-4 text-sm text-[var(--text-muted)]" role="status">
          No comments yet. Be the first to comment.
        </p>
      )}
    </section>
  );
}
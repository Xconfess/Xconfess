"use client";

import { memo, useEffect, useState } from "react";
import { ScrollRestorationLink } from "@/app/components/common/ScrollRestorationLink";
import Image from "next/image";
import { MessageSquare, Eye, ShieldAlert } from "lucide-react";
import { ReactionButton } from "./ReactionButtons";
import { AnchorButton } from "./AnchorButton";
import { TipButton } from "./TipButton";
import { ShareButton } from "./ShareButton";
import type { NormalizedConfession } from "../../lib/utils/normalizeConfession";
import { getTipStats, type TipStats } from "@/lib/services/tipping.service";

interface Props {
  confession: NormalizedConfession;
}

export const ConfessionCard = memo(({ confession }: Props) => {
  const [isAnchored, setIsAnchored] = useState(confession.isAnchored || false);
  const [txHash, setTxHash] = useState<string | null>(
    confession.stellarTxHash || null
  );
  const [tipStats, setTipStats] = useState<TipStats | null>(
    confession.tipStats || null
  );
  const [showWarnedContent, setShowWarnedContent] = useState(false);

  useEffect(() => {
    if (!tipStats) {
      getTipStats(confession.id).then((stats) => {
        if (stats) {
          setTipStats(stats);
        }
      });
    }
  }, [confession.id, tipStats]);

  const handleAnchorSuccess = (newTxHash: string) => {
    setIsAnchored(true);
    setTxHash(newTxHash);
  };

  const timeAgo = (date: string) => {
    const seconds = Math.floor(
      (new Date().getTime() - new Date(date).getTime()) / 1000
    );

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const authorName = confession.author?.username || "Anonymous";

  return (
    <article
      data-shortcut-confession={confession.id}
      className="luxury-panel rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--surface-strong)] focus-within:ring-2 focus-within:ring-[var(--primary)] sm:p-6"
      aria-label={`Confession by ${authorName}`}
    >
      <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-3">
          {confession.author?.avatar ? (
            <Image
              src={confession.author.avatar}
              alt=""
              width={44}
              height={44}
              className="rounded-xl border border-[var(--border)] bg-[var(--skeleton)] object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--primary-deep)]"
              aria-hidden="true"
            >
              A
            </div>
          )}

          <div>
            <p className="font-editorial text-2xl text-[var(--foreground)]">
              {authorName}
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--secondary)]">
              Anonymous confession
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--secondary)] sm:text-sm">
            <time dateTime={confession.createdAt}>{timeAgo(confession.createdAt)}</time>
          </p>
        </div>
      </div>

      {confession.contentWarning && !showWarnedContent ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="font-semibold text-[var(--foreground)]">Content warning</p>
              <p className="mt-1 text-sm leading-6 text-[var(--secondary)]">
                This confession may contain sensitive material. You choose whether to view it.
              </p>
              <button
                type="button"
                onClick={() => setShowWarnedContent(true)}
                className="mt-4 rounded-lg border border-amber-500/40 px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                Show confession
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ScrollRestorationLink
          href={`/confessions/${confession.id}`}
          className="group block rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          aria-label={`Read full confession: ${confession.content.slice(0, 80)}...`}
        >
          <p className="mb-4 font-editorial text-[1.55rem] leading-[1.42] text-[var(--foreground)] transition-colors group-hover:text-[var(--primary-deep)] sm:text-[1.65rem]">
            {confession.content}
          </p>
        </ScrollRestorationLink>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-[var(--secondary)]">
          {confession.viewCount !== undefined && (
            <div
              className="flex min-h-10 min-w-10 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5"
              aria-label={`${confession.viewCount} views`}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>{confession.viewCount}</span>
            </div>
          )}

          {confession.commentCount !== undefined && (
            <ScrollRestorationLink
              href={`/confessions/${confession.id}#comments`}
              className="flex min-h-10 min-w-10 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              aria-label={`View ${confession.commentCount} comments`}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>{confession.commentCount}</span>
            </ScrollRestorationLink>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TipButton
            confessionId={confession.id}
            recipientAddress={confession.author?.stellarAddress}
            initialStats={tipStats || undefined}
          />
          <AnchorButton
            confessionId={confession.id}
            confessionContent={confession.content}
            isAnchored={isAnchored}
            stellarTxHash={txHash}
            onAnchorSuccess={handleAnchorSuccess}
          />
          <ShareButton
            confessionId={confession.id}
            title="A confession from xConfess"
            variant="dropdown"
          />
          <div className="flex gap-2">
            <ReactionButton
              type="like"
              count={confession.reactions.like}
              confessionId={confession.id}
            />
            <ReactionButton
              type="love"
              count={confession.reactions.love}
              confessionId={confession.id}
            />
          </div>
        </div>
      </div>
    </article>
  );
});

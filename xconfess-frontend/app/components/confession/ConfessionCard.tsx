"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { Anchor, Eye, MessageSquare, ShieldAlert } from "lucide-react";
import { ScrollRestorationLink } from "@/app/components/common/ScrollRestorationLink";
import { cn } from "@/app/lib/utils/cn";
import { focusVisible } from "@/app/lib/utils/focusStyles";
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
  const [txHash, setTxHash] = useState<string | null>(confession.stellarTxHash || null);
  const [tipStats, setTipStats] = useState<TipStats | null>(confession.tipStats || null);
  const [showWarnedContent, setShowWarnedContent] = useState(false);

  useEffect(() => {
    if (!tipStats) {
      getTipStats(confession.id).then((stats) => {
        if (stats) setTipStats(stats);
      });
    }
  }, [confession.id, tipStats]);

  const timeAgo = (date: string) => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
    if (seconds < 604800) return Math.floor(seconds / 86400) + "d ago";
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const authorName = confession.author?.username || "Anonymous";
  const avatar = confession.author?.avatar;

  return (
    <article
      data-shortcut-confession={confession.id}
      className="feed-confession-card group rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors duration-150 hover:border-[var(--accent-border)] sm:p-6"
      aria-label={"Confession by " + authorName}
    >
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {avatar ? (
            <Image src={avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-medium text-[var(--secondary)]" aria-hidden="true">
              A
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium text-[var(--foreground)]">{authorName}</span>
            <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
            <time dateTime={confession.createdAt} className="shrink-0 text-[var(--text-muted)]">{timeAgo(confession.createdAt)}</time>
          </div>
        </div>
        {isAnchored && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--secondary)]">
            <Anchor className="h-3 w-3" aria-hidden="true" />
            Anchored
          </span>
        )}
      </header>

      {confession.contentWarning && !showWarnedContent ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Content warning</p>
              <p className="mt-1 text-sm leading-6 text-[var(--secondary)]">This confession may contain sensitive material. You choose whether to view it.</p>
              <button type="button" onClick={() => setShowWarnedContent(true)} className={cn("mt-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-muted)]", focusVisible)}>Show confession</button>
            </div>
          </div>
        </div>
      ) : (
        <ScrollRestorationLink href={"/confessions/" + confession.id} className={cn("group block pb-5 pt-3", focusVisible)} aria-label={"Read full confession: " + confession.content.slice(0, 80) + "..."}>
          <p className="max-w-[65ch] whitespace-pre-line font-editorial text-[1.125rem] leading-[1.65] text-[var(--foreground)] sm:text-[1.1875rem]">{confession.content}</p>
        </ScrollRestorationLink>
      )}

      <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
          {confession.viewCount !== undefined && <div className="flex min-h-8 items-center gap-1.5" aria-label={confession.viewCount + " views"}><Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{confession.viewCount}</span></div>}
          {confession.commentCount !== undefined && <ScrollRestorationLink href={"/confessions/" + confession.id + "#comments"} className={cn("flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] transition-colors hover:text-[var(--foreground)]", focusVisible)} aria-label={"View " + confession.commentCount + " comments"}><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /><span>{confession.commentCount}</span></ScrollRestorationLink>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
          <TipButton confessionId={confession.id} recipientAddress={confession.author?.stellarAddress} initialStats={tipStats || undefined} />
          <AnchorButton confessionId={confession.id} confessionContent={confession.content} isAnchored={isAnchored} stellarTxHash={txHash} onAnchorSuccess={(newTxHash) => { setIsAnchored(true); setTxHash(newTxHash); }} />
          <ShareButton confessionId={confession.id} title="A confession from xConfess" variant="dropdown" />
          <div className="flex gap-1.5"><ReactionButton type="like" count={confession.reactions.like} confessionId={confession.id} /><ReactionButton type="love" count={confession.reactions.love} confessionId={confession.id} /></div>
        </div>
      </footer>
    </article>
  );
});

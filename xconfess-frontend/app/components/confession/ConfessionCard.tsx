"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { Clock3, Eye, MessageSquare, ShieldAlert, Sparkles } from "lucide-react";
import { ScrollRestorationLink } from "@/app/components/common/ScrollRestorationLink";
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
      className="feed-confession-card group rounded-[26px] border border-[var(--border)] bg-[var(--surface-overlay)] p-5 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.85)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--accent-border)] hover:shadow-[0_26px_80px_-46px_rgba(93,36,145,0.72)] focus-within:ring-2 focus-within:ring-[var(--primary)] sm:p-7"
      aria-label={"Confession by " + authorName}
    >
      <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div className="flex min-w-0 items-center gap-3">
          {avatar ? (
            <Image src={avatar} alt="" width={46} height={46} className="h-11 w-11 rounded-2xl border border-[var(--border)] object-cover" loading="lazy" />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--primary-deep)]" aria-hidden="true">
              A
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-editorial text-[1.35rem] leading-none text-[var(--foreground)]">{authorName}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--secondary)]">Anonymous confession</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--secondary)]">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          <time dateTime={confession.createdAt}>{timeAgo(confession.createdAt)}</time>
        </div>
      </header>

      {confession.contentWarning && !showWarnedContent ? (
        <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="font-semibold text-[var(--foreground)]">Content warning</p>
              <p className="mt-1 text-sm leading-6 text-[var(--secondary)]">This confession may contain sensitive material. You choose whether to view it.</p>
              <button type="button" onClick={() => setShowWarnedContent(true)} className="mt-4 rounded-xl border border-amber-500/40 px-3.5 py-2 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">Show confession</button>
            </div>
          </div>
        </div>
      ) : (
        <ScrollRestorationLink href={"/confessions/" + confession.id} className="group block py-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" aria-label={"Read full confession: " + confession.content.slice(0, 80) + "..."}>
          <p className="max-w-2xl font-editorial text-[1.6rem] leading-[1.35] text-[var(--foreground)] transition-colors group-hover:text-[var(--primary-deep)] sm:text-[2rem]">{confession.content}</p>
        </ScrollRestorationLink>
      )}

      <footer className="flex flex-col gap-4 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-[var(--secondary)]">
          {confession.viewCount !== undefined && <div className="flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3" aria-label={confession.viewCount + " views"}><Eye className="h-3.5 w-3.5" aria-hidden="true" /><span>{confession.viewCount}</span></div>}
          {confession.commentCount !== undefined && <ScrollRestorationLink href={"/confessions/" + confession.id + "#comments"} className="flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 transition-colors hover:text-[var(--foreground)]" aria-label={"View " + confession.commentCount + " comments"}><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /><span>{confession.commentCount}</span></ScrollRestorationLink>}
          {isAnchored && <span className="hidden items-center gap-1 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-[var(--primary-deep)] sm:flex"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Anchored</span>}
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <TipButton confessionId={confession.id} recipientAddress={confession.author?.stellarAddress} initialStats={tipStats || undefined} />
          <AnchorButton confessionId={confession.id} confessionContent={confession.content} isAnchored={isAnchored} stellarTxHash={txHash} onAnchorSuccess={(newTxHash) => { setIsAnchored(true); setTxHash(newTxHash); }} />
          <ShareButton confessionId={confession.id} title="A confession from xConfess" variant="dropdown" />
          <div className="flex gap-2"><ReactionButton type="like" count={confession.reactions.like} confessionId={confession.id} /><ReactionButton type="love" count={confession.reactions.love} confessionId={confession.id} /></div>
        </div>
      </footer>
    </article>
  );
});

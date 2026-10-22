"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { profileAPI } from "@/app/lib/api/profile";
import type { TipHistoryItem } from "@/app/types/profile";

interface RecipientTipHistoryProps {
  userId: string;
}

function TipHistorySkeleton() {
  return (
    <div role="status" aria-label="Loading recipient tip history" className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 border-b border-zinc-200 py-3 last:border-0 dark:border-zinc-800">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

export function RecipientTipHistory({ userId }: RecipientTipHistoryProps) {
  const [tips, setTips] = useState<TipHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    profileAPI
      .getUserTips(userId)
      .then((items) => {
        if (!cancelled) setTips(items.filter((item) => item.type === "received"));
      })
      .catch(() => {
        if (!cancelled) {
          setTips([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, retry]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Received tips</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <TipHistorySkeleton />
        ) : failed ? (
          <div className="space-y-3 text-sm">
            <p role="alert" className="text-zinc-600 dark:text-zinc-400">
              Tip history is unavailable right now.
            </p>
            <Button variant="outline" size="sm" onClick={() => setRetry((current) => current + 1)}>
              Try again
            </Button>
          </div>
        ) : tips.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">No tips received yet.</p>
        ) : (
          <ul>
            {tips.map((tip) => (
              <li key={tip.id} className="flex items-center justify-between gap-4 border-b border-zinc-200 py-3 last:border-0 dark:border-zinc-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    From {tip.senderUsername || "Anonymous"}
                  </p>
                  <time dateTime={tip.createdAt} className="text-xs text-zinc-500">
                    {new Date(tip.createdAt).toLocaleDateString()}
                  </time>
                </div>
                <span className="shrink-0 text-sm font-semibold">{tip.amount} XLM</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
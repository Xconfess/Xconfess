"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/utils/formatDate";
import { getConfessions } from "@/app/lib/api/confessions";
import type { NormalizedConfession } from "@/app/lib/utils/normalizeConfession";

const RELATED_LIMIT = 4;

interface RelatedConfessionsProps {
  currentId: string;
  className?: string;
}

export function RelatedConfessions({
  currentId,
  className = "",
}: RelatedConfessionsProps) {
  const [items, setItems] = useState<NormalizedConfession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRelated() {
      const result = await getConfessions({
        page: 1,
        limit: RELATED_LIMIT + 5,
        sort: "newest",
      });
      if (cancelled) {
        setLoading(false);
        return;
      }
      if (result.ok === false) {
        setLoading(false);
        return;
      }
      const list = result.data.confessions;
      const filtered = list
        .filter((c: NormalizedConfession) => c.id !== currentId)
        .slice(0, RELATED_LIMIT);
      setItems(filtered);
      setLoading(false);
    }

    fetchRelated();
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  if (loading || items.length === 0) return null;

  return (
    <section
      className={className}
      aria-labelledby="related-confessions-heading"
    >
      <h2
        id="related-confessions-heading"
        className="text-lg font-semibold text-white mb-4"
      >
        Related confessions
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 list-none p-0 m-0">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/confessions/${c.id}`}
              className="block hover:opacity-95 transition-opacity"
            >
              <Card className="h-full overflow-hidden">
                <CardHeader className="py-3 px-4 text-xs text-zinc-500">
                  {formatDate(new Date(c.createdAt))}
                </CardHeader>
                <CardContent className="py-0 px-4 pb-4 pt-0">
                  <p className="text-zinc-200 text-sm line-clamp-3 wrap-break-word">
                    {c.content}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                    <span>👍 {c.reactions?.like ?? 0}</span>
                    <span>❤️ {c.reactions?.love ?? 0}</span>
                    {c.commentCount != null && (
                      <span>💬 {c.commentCount}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

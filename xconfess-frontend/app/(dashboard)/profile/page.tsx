"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Heart,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import apiClient from "@/app/lib/api";
import { useAuth } from "@/app/lib/hooks/useAuth";
import { formatDate } from "@/app/lib/utils/formatDate";

type ProfileSummary = {
  profile: {
    id: number;
    username: string;
    joinDate: string;
  };
  stats: {
    confessions: number;
    reactions: number;
    comments: number;
    tipsSent: number;
    tipsReceived: number;
  };
  badges: {
    id: string;
    name: string;
    description: string;
    contractId: string | null;
  }[];
  history: {
    data: {
      id: string;
      message: string;
      viewCount: number;
      reactions: number;
      comments: number;
      createdAt: string;
      isAnchored: boolean;
      stellarTxHash?: string | null;
    }[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
};

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="h-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

function initials(username: string) {
  return username
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get<ProfileSummary>("/api/users/profile/summary", {
        params: { page, limit: 5 },
      })
      .then((response) => {
        if (!cancelled) setSummary(response.data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your profile right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, page]);

  const statCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Confessions", value: summary.stats.confessions, icon: User },
      { label: "Reactions", value: summary.stats.reactions, icon: Heart },
      { label: "Comments", value: summary.stats.comments, icon: MessageCircle },
      { label: "Tips sent", value: summary.stats.tipsSent, icon: Wallet },
      { label: "Tips received", value: summary.stats.tipsReceived, icon: Sparkles },
    ];
  }, [summary]);

  if (isLoading || loading) return <ProfileSkeleton />;
  if (!isAuthenticated) return null;

  if (error || !summary) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardContent className="p-6 text-sm text-red-600">
            {error ?? "Profile data unavailable."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = Math.max(1, summary.history.meta.totalPages);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-xl font-semibold text-white dark:bg-white dark:text-zinc-950">
              {initials(summary.profile.username)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
                @{summary.profile.username}
              </h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
                <CalendarDays className="h-4 w-4" />
                Joined {formatDate(new Date(summary.profile.joinDate))}
              </p>
            </div>
          </div>
          <Link
            href="/settings"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-[15px] font-medium text-[var(--foreground)] transition-all hover:bg-[var(--surface-strong)]"
          >
            <Edit3 className="h-4 w-4" />
            Edit profile
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
                  <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                </div>
                <p className="text-2xl font-semibold text-zinc-950 dark:text-white">
                  {value}
                </p>
                <p className="mt-1 text-sm text-zinc-500">{label}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Confession History</CardTitle>
              <span className="text-sm text-zinc-500">
                {summary.history.meta.total} total
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary.history.data.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  No confessions published yet.
                </p>
              ) : (
                summary.history.data.map((confession) => (
                  <Link
                    key={confession.id}
                    href={`/confessions/${confession.id}`}
                    className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      <time dateTime={confession.createdAt}>
                        {formatDate(new Date(confession.createdAt))}
                      </time>
                      <span>{confession.reactions} reactions</span>
                      <span>{confession.comments} comments</span>
                      {confession.isAnchored && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Anchored
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-3 text-sm leading-6 text-zinc-800 dark:text-zinc-200">
                      {confession.message}
                    </p>
                  </Link>
                ))
              )}

              <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-zinc-500">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reputation Badges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.badges.map((badge) => (
                <div
                  key={badge.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-center gap-2 font-medium text-zinc-950 dark:text-white">
                    <BadgeCheck className="h-4 w-4 text-emerald-500" />
                    {badge.name}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {badge.description}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

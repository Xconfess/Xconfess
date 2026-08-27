"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "@/app/components/common/ErrorBoundary";
import { ConfessionFeed } from "@/app/components/confession/ConfessionFeed";
import { useScrollRestoration } from "@/app/lib/hooks/useScrollRestoration";
import { useAuthContext } from "../lib/providers/AuthProvider";
import { fetchUserStats } from "@/app/api/user.api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatBadge({
  label,
  value,
  loading = false,
}: {
  label: string;
  value?: string | number;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div
        className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 text-center animate-pulse"
        aria-hidden="true"
      >
        <div className="mb-2 h-8 w-12 rounded bg-[var(--skeleton)]" />
        <div className="h-3 w-16 rounded bg-[var(--surface)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 text-center">
      <span className="text-2xl font-bold text-[var(--foreground)]">
        {value ?? "-"}
      </span>
      <span className="mt-1 text-xs font-medium uppercase tracking-wide text-[var(--secondary)]">
        {label}
      </span>
    </div>
  );
}

function UserSummarySection() {
  const { user } = useAuthContext();
  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["userStats"],
    queryFn: fetchUserStats,
    retry: 1,
  });

  const displayName = user?.username
    ? `@${user.username}`
    : user?.email ?? "there";
  const joinedAt = user?.createdAt ? formatDate(user.createdAt) : null;

  return (
    <section className="luxury-panel space-y-5 rounded-[28px] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--foreground)]">
            Welcome back,{" "}
            <span className="text-[var(--primary)]">{displayName}</span>
          </h1>
          {joinedAt && (
            <p className="mt-1 text-sm text-[var(--secondary)]">
              Member since {joinedAt}
            </p>
          )}
        </div>
        <Link
          href="/#composer"
          className="inline-flex items-center justify-center rounded-full bg-[var(--brand-gradient)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_42px_-22px_rgba(91,46,255,0.58)] transition-transform hover:-translate-y-0.5"
        >
          New confession
        </Link>
      </div>

      {isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="mb-2 text-sm text-red-700">Failed to load stats</p>
          <button
            onClick={() => void refetch()}
            className="text-xs font-semibold text-red-700 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatBadge
            label="Confessions"
            value={stats?.totalConfessions}
            loading={isLoading}
          />
          <StatBadge
            label="Likes received"
            value={stats?.totalReactions}
            loading={isLoading}
          />
          <StatBadge
            label="Streak"
            value={stats?.streak ? `${stats.streak}d` : "0d"}
            loading={isLoading}
          />
        </div>
      )}
    </section>
  );
}

function RecentConfessionsSection() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--foreground)]">
          Recent confessions
        </h2>
        <Link
          href="/"
          className="text-sm font-medium text-[var(--primary)] hover:underline"
        >
          View all
        </Link>
      </div>

      <ErrorBoundary>
        <ConfessionFeed />
      </ErrorBoundary>
    </section>
  );
}

export default function DashboardPage() {
  useScrollRestoration("feed");

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-8 lg:px-10">
      <UserSummarySection />
      <RecentConfessionsSection />
    </main>
  );
}

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
import { getEmbeddedWallet, isEmbeddedWalletLocked } from "@/app/lib/crypto/embeddedWallet";
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

const LOCAL_AVATARS = ["🌙", "✨", "🌿", "🌊", "🪐", "🦋", "🌻", "🫧"];

type LocalConfession = {
  id: string;
  title?: string;
  body: string;
  createdAt: string;
  stellarTxHash?: string;
};

function LocalWalletProfile() {
  const [wallet, setWallet] = useState<ReturnType<typeof getEmbeddedWallet>>(null);
  const [locked, setLocked] = useState(false);
  const [alias, setAlias] = useState("");
  const [avatar, setAvatar] = useState("🌙");
  const [confessions, setConfessions] = useState<LocalConfession[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = getEmbeddedWallet();
    setWallet(stored);
    setLocked(isEmbeddedWalletLocked());
    if (!stored) return;
    setAlias(localStorage.getItem("xconfess.wallet.alias." + stored.publicKey) || "");
    setAvatar(localStorage.getItem("xconfess.wallet.avatar." + stored.publicKey) || "🌙");
    try {
      setConfessions(JSON.parse(localStorage.getItem("xconfess.wallet.confessions." + stored.publicKey) || "[]"));
    } catch {
      setConfessions([]);
    }
  }, []);

  const saveIdentity = () => {
    if (!wallet) return;
    localStorage.setItem("xconfess.wallet.alias." + wallet.publicKey, alias.trim().slice(0, 32));
    localStorage.setItem("xconfess.wallet.avatar." + wallet.publicKey, avatar);
    setSaved(true);
  };

  if (!wallet) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center"><div className="luxury-panel rounded-[var(--radius-panel)] p-8"><p className="eyebrow">Wallet identity</p><h1 className="mt-3 font-editorial text-4xl">Create your private identity.</h1><p className="mt-4 text-sm leading-7 text-[var(--secondary)]">Your wallet is your profile. No email, password, or login is required.</p><Link href="/wallet" className="mt-6 inline-flex rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white">Open XConfess Wallet</Link></div></div>;
  }

  if (locked) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center"><div className="luxury-panel rounded-[var(--radius-panel)] p-8"><p className="eyebrow">Wallet identity</p><h1 className="mt-3 font-editorial text-4xl">Unlock to view your profile.</h1><p className="mt-4 text-sm leading-7 text-[var(--secondary)]">Your profile and confession history are protected by your wallet lock.</p><Link href="/wallet" className="mt-6 inline-flex rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white">Unlock wallet</Link></div></div>;
  }

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
    <section className="luxury-panel rounded-[var(--radius-panel)] p-6 sm:p-8"><div className="flex flex-wrap items-center gap-5"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-soft)] text-4xl">{avatar}</div><div className="min-w-0 flex-1"><p className="eyebrow">Wallet identity</p><h1 className="mt-2 font-editorial text-4xl">{alias || "Anonymous by design"}</h1><p className="mt-2 break-all font-mono text-xs text-[var(--secondary)]">{wallet.publicKey}</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]"><label className="text-sm font-medium">Display name<input value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={32} placeholder="Optional alias" className="mt-2 h-11 w-full rounded-xl border bg-[var(--surface-muted)] px-3 text-sm" /></label><div><p className="text-sm font-medium">Avatar</p><div className="mt-2 flex flex-wrap gap-2">{LOCAL_AVATARS.map((option) => <button key={option} type="button" onClick={() => setAvatar(option)} className={"flex h-11 w-11 items-center justify-center rounded-xl border text-xl " + (avatar === option ? "border-[var(--primary)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-muted)]")} aria-label={"Choose avatar " + option}>{option}</button>)}</div></div></div><Button className="mt-5" onClick={saveIdentity}>Save identity</Button>{saved && <p className="mt-3 text-sm text-[var(--success)]">Identity saved locally on this device.</p>}</section>
    <section className="grid gap-4 sm:grid-cols-3"><div className="luxury-panel rounded-[var(--radius-panel)] p-5"><p className="eyebrow">Confessions</p><p className="mt-2 font-editorial text-4xl">{confessions.length}</p><p className="mt-1 text-sm text-[var(--secondary)]">Published from this wallet</p></div><div className="luxury-panel rounded-[var(--radius-panel)] p-5"><p className="eyebrow">Privacy</p><p className="mt-2 font-semibold">Anonymous by default</p><p className="mt-1 text-sm text-[var(--secondary)]">Your secret key never leaves this device.</p></div><div className="luxury-panel rounded-[var(--radius-panel)] p-5"><p className="eyebrow">Address</p><p className="mt-2 truncate font-mono text-sm">{wallet.publicKey.slice(0, 10)}…{wallet.publicKey.slice(-8)}</p><p className="mt-1 text-sm text-[var(--secondary)]">Wallet-based identity</p></div></section>
    <section className="luxury-panel rounded-[var(--radius-panel)] p-6 sm:p-8"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Your confessions</p><h2 className="mt-2 font-editorial text-3xl">A private record of what you shared</h2></div><Link href="/#composer" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold">Write</Link></div>{confessions.length === 0 ? <p className="mt-6 rounded-xl bg-[var(--surface-muted)] p-5 text-sm leading-7 text-[var(--secondary)]">Your published confessions will appear here. XConfess keeps this local index tied to your wallet identity.</p> : <div className="mt-6 space-y-3">{confessions.map((item) => <Link key={item.id} href={"/confessions/" + item.id} className="block rounded-xl border border-[var(--border)] p-4 hover:bg-[var(--surface-muted)]"><div className="flex items-center justify-between gap-3 text-xs text-[var(--secondary)]"><span>{new Date(item.createdAt).toLocaleDateString()}</span>{item.stellarTxHash && <span className="text-[var(--success)]">Anchored</span>}</div><p className="mt-2 line-clamp-2 text-sm leading-6">{item.title || item.body}</p></Link>)}</div>}</section>
  </main>;
}
export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


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

  if (!isLoading && !isAuthenticated) return <LocalWalletProfile />;
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

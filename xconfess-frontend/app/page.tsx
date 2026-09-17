"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import { ArrowDown, Anchor, Ban, HeartHandshake, Link2, Lock, MessageSquareText, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import Header from "./components/layout/Header";
import { MobileNav } from "./components/layout/MobileNav";
import { ConfessionFeed } from "./components/confession/ConfessionFeed";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { Button } from "./components/ui/button";

const EnhancedConfessionForm = dynamic(
  () =>
    import("./components/confession/EnhancedConfessionForm").then((mod) => ({
      default: mod.EnhancedConfessionForm,
    })),
  {
    loading: () => (
        <div className="luxury-panel animate-pulse rounded-[30px] p-8">
          <div className="mb-4 h-4 w-28 rounded-full bg-[var(--skeleton)]" />
          <div className="mb-3 h-8 w-64 rounded-full bg-[var(--skeleton)]" />
          <div className="mb-8 h-5 w-72 rounded-full bg-[var(--surface-muted)]" />
          <div className="mb-4 h-14 w-full rounded-[30px] bg-[var(--surface-muted)]" />
          <div className="mb-4 h-12 w-full rounded-[30px] bg-[var(--surface-muted)]" />
          <div className="h-64 w-full rounded-[30px] bg-[var(--surface-muted)]" />
      </div>
    ),
    ssr: false,
  },
);

const trustSignals = [
  {
    icon: Lock,
    title: "Private",
    description: "Post without exposing your identity.",
  },
  {
    icon: MessageSquareText,
    title: "Community",
    description: "Read, react, comment, and reply.",
  },
  {
    icon: Anchor,
    title: "Optional proof",
    description: "Anchor important posts on Stellar.",
  },
];

export default function Home() {
  const scrollToComposer = useCallback(() => {
    document.getElementById("composer")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const scrollToFeed = useCallback(() => {
    document.getElementById("feed")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  return (
    <>
      <Header />

      <main className="editorial-shell relative overflow-hidden pb-24">
        <svg className="atmospheric-landscape" viewBox="0 0 820 240" role="img" aria-hidden="true">
          <path className="landscape-back" d="M0 190 112 126l74 36 106-82 92 59 86-41 86 52 86-64 78 47v107H0Z" />
          <path className="landscape-front" d="m0 218 94-64 88 28 84-46 78 32 92-73 88 66 83-35 82 49 131-38v103H0Z" />
          <path className="landscape-ridge" d="M0 190 112 126l74 36 106-82 92 59 86-41 86 52 86-64 78 47" />
        </svg>
        <span className="hero-orb -right-32 top-0" aria-hidden="true" /><span className="hero-orb -left-48 top-[28rem] opacity-60" aria-hidden="true" /><section className="relative z-10 mx-auto flex w-full max-w-[1360px] flex-col gap-14 px-4 pb-16 pt-8 sm:gap-20 sm:px-6 sm:pt-12 lg:px-10 lg:pt-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="space-y-7 lg:col-span-7 sm:space-y-9">
              <div className="eyebrow text-[var(--brand-violet)]">Anonymous confessions</div>

              <div className="max-w-4xl space-y-6">
                <h1 className="max-w-3xl font-editorial text-5xl leading-[0.92] text-[var(--foreground)] sm:text-7xl lg:text-[6.5rem]">
                  Say it.<br />Anonymously.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[var(--secondary)] sm:text-lg">
                  Share what is on your mind, join the conversation, and keep
                  your identity protected.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                <Button size="lg" onClick={scrollToComposer}>
                  Write confession
                </Button>
                <Button size="lg" variant="outline" onClick={scrollToFeed}>
                  Browse feed
                </Button>
              </div>
            <div className="grid max-w-xl grid-cols-3 gap-4 border-t border-[var(--border)] pt-5 text-sm"><div><p className="font-editorial text-2xl text-[var(--foreground)]">12.4K</p><p className="mt-1 text-xs text-[var(--secondary)]">confessions</p></div><div className="border-l border-[var(--border)] pl-4"><p className="font-editorial text-2xl text-[var(--foreground)]">284K</p><p className="mt-1 text-xs text-[var(--secondary)]">community members</p></div><div className="border-l border-[var(--border)] pl-4"><p className="font-editorial text-2xl text-[var(--foreground)]">100%</p><p className="mt-1 text-xs text-[var(--secondary)]">anonymous by design</p></div></div></div>

            <aside className="luxury-panel rounded-[var(--radius-panel)] p-3 sm:p-5 lg:col-span-5">
              <div className="mb-4 flex items-center justify-between px-3 pt-2"><div><p className="eyebrow text-[var(--brand-violet)]">A kinder internet</p><p className="mt-2 font-editorial text-2xl">Your privacy, first.</p></div><ShieldCheck className="h-6 w-6 text-[var(--brand-violet)]" aria-hidden="true" /></div><div className="space-y-2">
                {trustSignals.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="group flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 transition-transform duration-200 hover:-translate-y-0.5 hover:border-[var(--accent-border)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--primary-deep)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-[var(--foreground)]">
                        {title}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-[var(--secondary)]">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <ErrorBoundary>
            <section
              id="composer"
              className="grid gap-8 lg:grid-cols-12 lg:items-start"
            >
              <div className="space-y-6 lg:col-span-8">
                <div className="space-y-3">
                  <p className="eyebrow text-[var(--brand-violet)]">Writing desk</p>
                  <h2 className="font-editorial text-4xl text-[var(--foreground)] sm:text-5xl">
                    Share your confession
                  </h2>
                </div>

                <EnhancedConfessionForm className="rounded-2xl p-1" />
              </div>

              <aside className="space-y-5 lg:sticky lg:top-28 lg:col-span-4">
                <div className="guidelines-card luxury-panel rounded-[22px] p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-[var(--brand-violet)]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">Community guidelines</h3>
                  </div>
                  <div className="mt-4 divide-y divide-[var(--border)]">
                    {[
                      { icon: UserRound, title: "No personal details", copy: "Keep yourself and others safe." },
                      { icon: HeartHandshake, title: "Be respectful", copy: "Kindness builds a better space." },
                      { icon: Ban, title: "No harassment or hate", copy: "Zero tolerance." },
                      { icon: Link2, title: "Optional proof only", copy: "Use Stellar to anchor important posts." },
                    ].map(({ icon: Icon, title, copy }) => (
                      <div key={title} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--brand-violet)]">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--foreground)]">{title}</p>
                          <p className="mt-0.5 text-[11px] leading-5 text-[var(--secondary)]">{copy}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={scrollToFeed}
                  className="guidelines-callout luxury-panel flex w-full items-center justify-between rounded-[22px] px-5 py-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--brand-violet)]">
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold leading-5 text-[var(--primary-deep)]">A more honest internet<br />starts with you.</p>
                    </div>
                  </div>
                  <ArrowDown className="h-4 w-4 rotate-[-90deg] text-[var(--primary-deep)]" />
                </button>

                <button
                  type="button"
                  onClick={scrollToFeed}
                  className="luxury-panel flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left text-[var(--foreground)] transition-transform hover:-translate-y-0.5"
                >
                  <div>
                    <p className="eyebrow">Continue reading</p>
                    <p className="mt-2 font-editorial text-3xl">
                      Feed
                    </p>
                  </div>
                  <ArrowDown className="h-5 w-5 text-[var(--primary-deep)]" />
                </button>
              </aside>
            </section>

            <section id="feed" className="space-y-6 pt-6">
              <div className="space-y-3">
                <p className="eyebrow">Recent confessions</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <h2 className="font-editorial text-4xl text-[var(--foreground)] sm:text-5xl">
                      Read the room
                    </h2>
                    <p className="max-w-2xl text-sm leading-8 text-[var(--secondary)] sm:text-base">
                      Latest public confessions from the community.
                    </p>
                  </div>
                </div>
              </div>

              <ConfessionFeed />
            </section>
          </ErrorBoundary>
        </section>
      </main>
      <MobileNav />
    </>
  );
}
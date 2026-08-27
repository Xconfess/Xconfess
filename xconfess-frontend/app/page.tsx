"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import { ArrowDown, Anchor, Lock, MessageSquareText } from "lucide-react";
import Header from "./components/layout/Header";
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
        <div className="luxury-panel animate-pulse rounded-2xl p-8">
          <div className="mb-4 h-4 w-28 rounded-full bg-[var(--skeleton)]" />
          <div className="mb-3 h-8 w-64 rounded-full bg-[var(--skeleton)]" />
          <div className="mb-8 h-5 w-72 rounded-full bg-[var(--surface-muted)]" />
          <div className="mb-4 h-14 w-full rounded-xl bg-[var(--surface-muted)]" />
          <div className="mb-4 h-12 w-full rounded-xl bg-[var(--surface-muted)]" />
          <div className="h-64 w-full rounded-2xl bg-[var(--surface-muted)]" />
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
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_380px] lg:items-start">
            <div className="space-y-8">
              <div className="eyebrow">Anonymous confessions</div>

              <div className="max-w-4xl space-y-6">
                <h1 className="font-editorial text-5xl leading-[0.95] text-[var(--foreground)] sm:text-6xl lg:text-7xl">
                  Say it. Anonymously.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[var(--secondary)] sm:text-lg">
                  Share what is on your mind, join the conversation, and keep
                  your identity protected.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={scrollToComposer}>
                  Write confession
                </Button>
                <Button size="lg" variant="outline" onClick={scrollToFeed}>
                  Browse feed
                </Button>
              </div>
            </div>

            <aside className="luxury-panel rounded-2xl p-6">
              <div className="space-y-3">
                {trustSignals.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"
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
              className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_320px] lg:items-start"
            >
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="eyebrow">New confession</p>
                  <h2 className="font-editorial text-4xl text-[var(--foreground)] sm:text-5xl">
                    Write freely
                  </h2>
                </div>

                <EnhancedConfessionForm className="rounded-2xl p-1" />
              </div>

              <aside className="space-y-5 lg:sticky lg:top-28">
                <div className="luxury-panel rounded-2xl p-6">
                  <p className="eyebrow">Guidelines</p>
                  <div className="mt-5 space-y-4">
                    {[
                      "No names or personal details.",
                      "Respect the community.",
                      "Anchor only when needed.",
                    ].map((tip) => (
                      <div
                        key={tip}
                        className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-7 text-[var(--secondary)]"
                      >
                        {tip}
                      </div>
                    ))}
                  </div>
                </div>

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
    </>
  );
}

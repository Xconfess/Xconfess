"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback } from "react";
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
      <div className="animate-pulse rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="mb-3 h-9 w-full rounded-[var(--radius-control)] bg-[var(--skeleton)]" />
        <div className="h-40 w-full rounded-[var(--radius-control)] bg-[var(--skeleton)]" />
      </div>
    ),
    ssr: false,
  },
);

const guidelines = [
  { title: "No personal details", copy: "Don't name or identify yourself or anyone else." },
  { title: "Be respectful", copy: "Disagree with ideas, not people." },
  { title: "No harassment or hate", copy: "Posts that target others are removed." },
  { title: "Proof is optional", copy: "Anchoring a post on Stellar is never required." },
];

export default function Home() {
  const scrollToComposer = useCallback(() => {
    document.getElementById("composer")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  return (
    <>
      <Header />

      <main className="pb-24 md:pb-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <section className="flex flex-col gap-6 border-b border-[var(--border)] py-10 sm:flex-row sm:items-end sm:justify-between sm:py-14">
            <div className="max-w-xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
                Say it. Anonymously.
              </h1>
              <p className="text-base leading-7 text-[var(--secondary)]">
                Post anonymously, read what others are carrying, and respond
                without anyone knowing who you are.
              </p>
            </div>
            <Button size="lg" onClick={scrollToComposer} className="self-start sm:self-auto">
              Write confession
            </Button>
          </section>

          <ErrorBoundary>
            <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
              <div className="min-w-0 space-y-12">
                <section id="composer" aria-label="New confession" className="scroll-mt-20">
                  <EnhancedConfessionForm />
                </section>

                <section id="feed" aria-labelledby="feed-heading" className="scroll-mt-20 space-y-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 id="feed-heading" className="text-lg text-[var(--foreground)]">
                      Popular today
                    </h2>
                    <Link
                      href="/confessions"
                      className="text-sm text-[var(--secondary)] transition-colors hover:text-[var(--foreground)]"
                    >
                      View all
                    </Link>
                  </div>
                  <ConfessionFeed initialSort="trending" limit={3} preview />
                </section>
              </div>

              <aside className="lg:sticky lg:top-20 lg:self-start">
                <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5">
                  <h2 className="text-sm text-[var(--foreground)]">Community guidelines</h2>
                  <ul className="mt-4 space-y-4">
                    {guidelines.map(({ title, copy }) => (
                      <li key={title}>
                        <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
                        <p className="mt-0.5 text-sm leading-6 text-[var(--secondary)]">{copy}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </ErrorBoundary>
        </div>
      </main>
      <MobileNav />
    </>
  );
}

import type { Metadata } from "next";
import Header from "@/app/components/layout/Header";
import { ConfessionFeed } from "@/app/components/confession/ConfessionFeed";

export const metadata: Metadata = {
  title: "Confessions | Xconfess",
  description: "Browse anonymous confessions from the Xconfess community.",
};

export default function ConfessionsPage() {
  return (
    <>
      <Header />
      <main className="editorial-shell min-h-[calc(100vh-80px)] overflow-hidden pb-20">
        <section className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
          <div className="max-w-3xl space-y-3">
            <p className="eyebrow">Community feed</p>
            <h1 className="font-editorial text-4xl leading-tight text-[var(--foreground)] sm:text-5xl">
              Read the room
            </h1>
            <p className="text-base leading-8 text-[var(--secondary)]">
              Browse recent, popular, and most-discussed anonymous confessions.
            </p>
          </div>
          <ConfessionFeed />
        </section>
      </main>
    </>
  );
}

"use client";

import Header from "@/app/components/layout/Header";
import { FloatingComparisonBar } from "@/app/components/comparison/FloatingComparisonBar";
import { MobileNav } from "@/app/components/layout/MobileNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <nav aria-label="Main navigation" role="navigation">
        <Header />
      </nav>
      <main id="main-content" className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-6 sm:pb-12">
        {children}
      </main>
      <div role="complementary" aria-label="Comparison tools">
        <FloatingComparisonBar />
      </div>
      <nav aria-label="Mobile navigation" role="navigation">
        <MobileNav />
      </nav>
    </div>
  );
}

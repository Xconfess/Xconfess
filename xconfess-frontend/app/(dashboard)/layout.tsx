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
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-6 sm:pb-12">{children}</main>
      <FloatingComparisonBar />
      <MobileNav />
    </div>
  );
}

"use client";

import Header from "@/app/components/layout/Header";
import { FloatingComparisonBar } from "@/app/components/comparison/FloatingComparisonBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
      <FloatingComparisonBar />
    </div>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Header from "@/app/components/layout/Header";
import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingComparisonBar } from "@/app/components/comparison/FloatingComparisonBar";
import { useAuth } from "@/app/lib/hooks/useAuth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && pathname.startsWith("/admin") && user?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [pathname, user, isLoading, router]);

  if (!isLoading && pathname.startsWith("/admin") && user?.role !== "admin") {
    return null; // Prevent flash of admin content
  }

  return (
    <AuthGuard>
      <div className="min-h-screen w-full overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
        <FloatingComparisonBar />
      </div>
    </AuthGuard>
  );
}

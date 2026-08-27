"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { AUTH_TOKEN_KEY } from "@/app/lib/api/constants";
import { useFocusTrap } from "@/app/lib/hooks/useFocusTrap";
import { getWsUrl } from "@/app/lib/config";
import { useAuth } from "@/app/lib/hooks/useAuth";
import { BrandLogo } from "@/app/components/brand/BrandLogo";

function isDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  return process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newReportsCount, setNewReportsCount] = useState(0);
  const queryClient = useQueryClient();
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);

  const navItems = useMemo(
    () => [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/reports", label: "Reports" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/notifications", label: "Notifications" },
      { href: "/admin/audit-logs", label: "Audit logs" },
      { href: "/admin/diagnostics", label: "Diagnostics" },
    ],
    [],
  );

  useEffect(() => {
    if (isDevBypassEnabled()) {
      if (user?.role !== "admin") router.replace("/dashboard");
      return;
    }

    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router, user]);

  useEffect(() => {
    if (isDevBypassEnabled()) return;
    if (!user || user.role !== "admin") return;

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(AUTH_TOKEN_KEY)
        : null;
    if (!token) return;

    const baseUrl = getWsUrl();
    if (!baseUrl) return;

    const socket: Socket = io(`${baseUrl}/admin`, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => setNewReportsCount(0));
    socket.on("new-report", () => {
      setNewReportsCount((count) => count + 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reports.all() });
    });
    socket.on("report-updated", (updatedReport: any) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.admin.reports.all() },
        (old: any) => {
          if (!old?.reports) return old;
          return {
            ...old,
            reports: old.reports.map((report: any) =>
              report.id === updatedReport.id
                ? {
                    ...report,
                    status: updatedReport.status,
                    resolvedAt: updatedReport.resolvedAt,
                  }
                : report,
            ),
          };
        },
      );
    });
    socket.on("reports-bulk-updated", (updatedReports: any[]) => {
      const updateMap = new Map(updatedReports.map((report) => [report.id, report]));
      queryClient.setQueriesData(
        { queryKey: queryKeys.admin.reports.all() },
        (old: any) => {
          if (!old?.reports) return old;
          return {
            ...old,
            reports: old.reports.map((report: any) =>
              updateMap.has(report.id)
                ? {
                    ...report,
                    status: updateMap.get(report.id).status,
                    resolvedAt: updateMap.get(report.id).resolvedAt,
                  }
                : report,
            ),
          };
        },
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, user]);

  useFocusTrap({
    active: mobileOpen,
    containerRef: mobileDrawerRef,
    initialFocusRef: mobileCloseButtonRef,
    restoreFocusRef: mobileMenuButtonRef,
    onEscape: () => setMobileOpen(false),
    trapFocus: true,
  });

  if (isLoading) return null;
  if (!isDevBypassEnabled() && !isAuthenticated) return null;
  if (user?.role !== "admin") return null;

  const renderNav = (onNavigate?: () => void) => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active =
          pathname === item.href ||
          (pathname?.startsWith(`${item.href}/`) ?? false);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={[
              "block rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--accent-soft)] text-[var(--primary)]"
                : "text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <span className="flex items-center justify-between">
              <span>{item.label}</span>
              {item.href === "/admin/reports" && newReportsCount > 0 && (
                <span className="ml-3 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                  {newReportsCount}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-3 text-[var(--secondary)] hover:bg-[var(--accent-soft)]"
            aria-label="Open admin navigation"
            ref={mobileMenuButtonRef}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Admin</span>
            {isDevBypassEnabled() && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--primary)]">
                dev
              </span>
            )}
            {newReportsCount > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-700">
                {newReportsCount} new
              </span>
            )}
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            Back
          </Link>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 h-full w-72 border-r border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            ref={mobileDrawerRef}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-bold">Admin</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl p-2 text-[var(--secondary)] hover:bg-[var(--accent-soft)]"
                aria-label="Close admin navigation"
                ref={mobileCloseButtonRef}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {renderNav(() => setMobileOpen(false))}

            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              >
                Back to app
              </Link>
            </div>
          </aside>
        </div>
      )}

      <div className="flex">
        <aside className="sticky top-0 hidden min-h-screen border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:w-72 lg:shrink-0 lg:flex-col">
          <div className="border-b border-[var(--border)] px-4 py-4">
            <BrandLogo imageClassName="w-[142px] dark:hidden" />
            <BrandLogo tone="light" imageClassName="hidden w-[142px] dark:block" />
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--secondary)]">
                Admin
              </span>
              <span className="sr-only">Admin Dashboard</span>
              {isDevBypassEnabled() && (
                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--primary)]">
                  dev
                </span>
              )}
            </div>
          </div>

          <div className="p-3">{renderNav()}</div>

          <div className="mt-auto border-t border-[var(--border)] p-3">
            <Link
              href="/"
              className="block rounded-xl px-3 py-2 text-sm font-medium text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            >
              Back to app
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { AUTH_TOKEN_KEY } from "@/app/lib/api/constants";
import { useFocusTrap } from "@/app/lib/hooks/useFocusTrap";
import { getWsUrl } from "@/app/lib/config";
import { useAuth } from "@/app/lib/hooks/useAuth";

/**
 * Returns true only when running in a local development environment AND the
 * shared dev auth bypass flag is explicitly enabled.
 */
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
      { href: "/admin/audit-logs", label: "Audit Logs" },
      { href: "/admin/diagnostics", label: "Diagnostics" },
    ],
    [],
  );

  useEffect(() => {
    // In development mock mode, skip real auth checks (but NOT role checks)
    if (isDevBypassEnabled()) {
      if (user?.role !== "admin") {
        router.replace("/dashboard");
      }
      return;
    }

    if (isLoading) {
      return;
    }

    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }

    if (user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router, user]);

  useEffect(() => {
    // Real-time notifications for new reports (admins only)
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

    socket.on("connect", () => {
      // reset counter on connect
      setNewReportsCount(0);
    });

    socket.on("new-report", () => {
      setNewReportsCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reports.all() });
    });

    socket.on("report-updated", (updatedReport: any) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.admin.reports.all() },
        (old: any) => {
          if (!old?.reports) return old;
          const newReports = old.reports.map((r: any) =>
            r.id === updatedReport.id
              ? {
                  ...r,
                  status: updatedReport.status,
                  resolvedAt: updatedReport.resolvedAt,
                }
              : r,
          );
          return { ...old, reports: newReports };
        },
      );
    });

    socket.on("reports-bulk-updated", (updatedReports: any[]) => {
      const updateMap = new Map(updatedReports.map((r) => [r.id, r]));
      queryClient.setQueriesData(
        { queryKey: queryKeys.admin.reports.all() },
        (old: any) => {
          if (!old?.reports) return old;
          const newReports = old.reports.map((r: any) =>
            updateMap.has(r.id)
              ? {
                  ...r,
                  status: updateMap.get(r.id).status,
                  resolvedAt: updateMap.get(r.id).resolvedAt,
                }
              : r,
          );
          return { ...old, reports: newReports };
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

  if (isLoading) {
    return null;
  }

  if (!isDevBypassEnabled()) {
    if (!isAuthenticated) {
      return null;
    }
  }

  if (user?.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-md p-4 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px] min-w-[44px]"
            aria-label="Open sidebar"
            ref={mobileMenuButtonRef}
          >
            <span className="text-xl leading-none">☰</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-white">
              Admin
            </span>
            {isDevBypassEnabled() && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                dev
              </span>
            )}
            {newReportsCount > 0 && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
                {newReportsCount} new
              </span>
            )}
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            Back
          </Link>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            ref={mobileDrawerRef}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  Admin Dashboard
                </span>
                {isDevBypassEnabled() && (
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                    dev
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close sidebar"
                ref={mobileCloseButtonRef}
              >
                ✕
              </button>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (pathname?.startsWith(item.href + "/") ?? false);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={[
                      "block rounded-md px-3 py-2 text-sm font-medium",
                      active
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800",
                    ].join(" ")}
                  >
                    <span className="flex items-center justify-between">
                      <span>{item.label}</span>
                      {item.href === "/admin/reports" &&
                        newReportsCount > 0 && (
                          <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
                            {newReportsCount}
                          </span>
                        )}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Back to Site
              </Link>
            </div>
          </aside>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 min-h-screen sticky top-0">
          <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  Admin Dashboard
                </span>
                {isDevBypassEnabled() && (
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                    dev
                  </span>
                )}
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (pathname?.startsWith(item.href + "/") ?? false);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "block rounded-md px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  <span className="flex items-center justify-between">
                    <span>{item.label}</span>
                    {item.href === "/admin/reports" && newReportsCount > 0 && (
                      <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
                        {newReportsCount}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto p-3 border-t border-gray-200 dark:border-gray-800">
            <Link
              href="/"
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Back to Site
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

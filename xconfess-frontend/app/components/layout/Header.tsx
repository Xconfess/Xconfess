"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useRef } from "react";
import { Menu, Search, UserRound } from "lucide-react";
import { ThemeToggle } from "../common/ThemeToggle";
import { WalletButton } from "@/components/wallet/WalletButton";

import { BrandLogo } from "@/app/components/brand/BrandLogo";
import { NotificationBell } from "@/app/components/notifications/NotificationBell";
import { cn } from "@/app/lib/utils/cn";
import Sidebar from "./Sidebar";

const navItems = [
  { href: "/", label: "Feed" },
  { href: "/search", label: "Explore" },
  { href: "/wallet", label: "Wallet" },
];

const iconButtonClass =
  "flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]";

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  const handleNavKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        closeMobileMenu();
      }
    },
    [mobileMenuOpen, closeMobileMenu],
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <>
      <header
        aria-label="Main navigation"
        className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface-overlay)] backdrop-blur-md"
        onKeyDown={handleNavKeyDown}
      >
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <BrandLogo priority imageClassName="w-[104px] sm:w-[120px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[104px] sm:w-[120px] dark:block" />

            <div className="hidden items-center gap-1 md:flex">
              {navItems.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "rounded-[var(--radius-control)] px-3 py-1.5 text-sm transition-colors",
                    isActive(href)
                      ? "font-medium text-[var(--foreground)]"
                      : "text-[var(--secondary)] hover:text-[var(--foreground)]",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-1 md:flex">
            <Link href="/search" aria-label="Search" className={iconButtonClass}>
              <Search className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <NotificationBell />
            <span aria-hidden="true" className="mx-2 h-5 w-px bg-[var(--border)]" />
            <WalletButton />
            <Link href="/profile" aria-label="Profile" className={cn(iconButtonClass, "ml-1 rounded-full border border-[var(--border)]")}>
              <UserRound className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <NotificationBell />
            <button
              ref={menuButtonRef}
              type="button"
              className={cn(iconButtonClass, "-mr-2 h-11 w-11")}
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu aria-hidden="true" size={20} />
            </button>
          </div>
        </nav>
      </header>

      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
      />
    </>
  );
}

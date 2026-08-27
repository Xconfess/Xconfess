"use client";

import Link from "next/link";
import { useState, useCallback, useRef } from "react";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "../../lib/hooks/useAuth";
import { ThemeToggle } from "../common/ThemeToggle";
import { WalletButton } from "@/components/wallet/WalletButton";
import { BrandLogo } from "@/app/components/brand/BrandLogo";
import Sidebar from "./Sidebar";

const navLinkClass =
  "rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--secondary)] transition-all duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

export default function Header() {
  const { user, logout } = useAuth();
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

  return (
    <>
      <header
        aria-label="Main navigation"
        className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_60px_-48px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        onKeyDown={handleNavKeyDown}
      >
        <nav className="mx-auto max-w-6xl px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-6">
            <BrandLogo priority imageClassName="w-[142px] sm:w-[164px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[142px] sm:w-[164px] dark:block" />

            <div className="hidden items-center space-x-2 md:flex">
              <Link href="/" className={navLinkClass}>
                Feed
              </Link>
              <Link href="/search" className={navLinkClass}>
                Search
              </Link>
              <Link href="/compare" className={navLinkClass}>
                Compare
              </Link>
              <Link href="/profile" className={navLinkClass}>
                Profile
              </Link>
              <Link href="/anchors" className={navLinkClass}>
                Anchors
              </Link>
              {user?.role === "admin" && (
                <Link href="/admin" className={navLinkClass + " font-bold"}>
                  Admin
                </Link>
              )}
              <Link href="/messages" className={navLinkClass}>
                Messages
              </Link>

              <div
                aria-hidden="true"
                className="mx-2 h-8 w-px bg-[var(--border)]"
              />

              <WalletButton className="hidden md:inline-flex" />
              <ThemeToggle />

              {user && (
                <div className="flex items-center space-x-4">
                  <span
                    aria-label={`Logged in as ${user.username}`}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm text-[var(--secondary)]"
                  >
                    @{user.username}
                  </span>
                  <button
                    onClick={logout}
                    className="flex items-center space-x-1 rounded-xl px-3 py-2 text-red-300 transition-colors hover:bg-red-950/40 hover:text-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                  >
                    <LogOut aria-hidden="true" size={18} />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 md:hidden">
              <WalletButton className="md:hidden" />
              <ThemeToggle />
              <button
                ref={menuButtonRef}
                type="button"
                className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu aria-hidden="true" size={24} />
              </button>
            </div>
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

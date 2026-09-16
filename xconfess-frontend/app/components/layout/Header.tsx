"use client";

import Link from "next/link";
import { useState, useCallback, useRef } from "react";
import { LogOut, Menu } from "lucide-react";
import { ThemeToggle } from "../common/ThemeToggle";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useAuth } from "@/app/lib/hooks/useAuth";

import { BrandLogo } from "@/app/components/brand/BrandLogo";
import Sidebar from "./Sidebar";

const navLinkClass =
  "rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--secondary)] transition-all duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
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
        <nav className="mx-auto max-w-6xl px-3 py-2.5 sm:px-6 sm:py-3.5 lg:px-8">
          <div className="flex items-center justify-between gap-2 sm:gap-6">
            <BrandLogo priority imageClassName="w-[112px] sm:w-[164px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[112px] sm:w-[164px] dark:block" />

            <div className="hidden items-center space-x-2 md:flex">
              <Link href="/" className={navLinkClass}>
                Feed
              </Link>
              <div
                aria-hidden="true"
                className="mx-2 h-8 w-px bg-[var(--border)]"
              />

              <Link href="/wallet" className={navLinkClass}>Wallet</Link>
              {isAuthenticated && <button type="button" onClick={logout} aria-label="Logout" className={navLinkClass}><LogOut aria-hidden="true" className="mr-2 inline h-4 w-4" />Logout</button>}
              <WalletButton className="hidden" />
              <ThemeToggle />

            </div>

            <div className="flex min-w-0 items-center gap-1.5 md:hidden">
              <Link href="/wallet" className="flex min-h-[44px] items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--foreground)]">Wallet</Link>
              <WalletButton className="hidden" />
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
"use client";

import Link from "next/link";
import { useState, useCallback, useRef } from "react";
import { Menu, Search, UserRound, WalletCards } from "lucide-react";
import { ThemeToggle } from "../common/ThemeToggle";
import { WalletButton } from "@/components/wallet/WalletButton";

import { BrandLogo } from "@/app/components/brand/BrandLogo";
import Sidebar from "./Sidebar";

const navLinkClass =
  "rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--secondary)] transition-all duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

export default function Header() {
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
        <nav className="mx-auto max-w-7xl px-2.5 py-2 sm:px-6 sm:py-3.5 lg:px-8">
          <div className="flex items-center justify-between gap-1.5 sm:gap-6">
            <BrandLogo priority imageClassName="w-[104px] xs:w-[112px] sm:w-[164px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[104px] xs:w-[112px] sm:w-[164px] dark:block" />

            <div className="hidden items-center gap-1 md:flex">
              <Link href="/" className={navLinkClass}>Feed</Link>
              <Link href="/search" className={navLinkClass}>Explore</Link>
              <Link href="/#about" className={navLinkClass}>About</Link>
              <Link href="/wallet" className={navLinkClass}><WalletCards className="mr-2 inline h-4 w-4" />Wallet</Link>
              <span aria-hidden="true" className="mx-2 h-7 w-px bg-[var(--border)]" />
              <WalletButton />
              <Link href="/search" aria-label="Search" className="hidden h-10 w-10 items-center justify-center rounded-full text-[var(--secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] dark:flex"><Search className="h-4 w-4" /></Link>
              <ThemeToggle />
              <Link href="/profile" aria-label="Profile" className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--primary-deep)] transition-colors hover:bg-[var(--surface-muted)]"><UserRound className="h-4 w-4" /></Link>
            </div>

            <div className="flex min-w-0 items-center gap-1 sm:gap-2 md:hidden">
              <Link href="/wallet" className="flex min-h-[44px] items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 sm:px-3 text-xs sm:text-sm font-semibold text-[var(--foreground)]">Wallet</Link>
              <WalletButton className="hidden" />
              <ThemeToggle />
              <button
                ref={menuButtonRef}
                type="button"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 sm:p-3 text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu aria-hidden="true" size={22} className="sm:h-6 sm:w-6" />
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
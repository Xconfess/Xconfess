"use client";

import Link from "next/link";
import { useState, useCallback, useRef } from "react";
import { Menu } from "lucide-react";
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
        <nav className="mx-auto max-w-6xl px-2.5 py-2 sm:px-6 sm:py-3.5 lg:px-8">
          <div className="flex items-center justify-between gap-1.5 sm:gap-6">
            <BrandLogo priority imageClassName="w-[104px] xs:w-[112px] sm:w-[164px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[104px] xs:w-[112px] sm:w-[164px] dark:block" />

            <div className="hidden items-center space-x-2 md:flex">
              <Link href="/" className={navLinkClass}>
                Feed
              </Link>
              <div
                aria-hidden="true"
                className="mx-2 h-8 w-px bg-[var(--border)]"
              />

              <WalletButton className="hidden md:inline-flex" />
              <ThemeToggle />

            </div>

            <div className="flex min-w-0 items-center gap-1 sm:gap-2 md:hidden">
              <WalletButton className="md:hidden" />
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

"use client";

import Link from "next/link";
import { Home, PenLine, Search, UserRound, WalletCards } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/app/lib/utils/cn";

const items = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/#composer", label: "Write", icon: PenLine },
  { href: "/wallet", label: "Wallet", icon: WalletCards },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface-overlay)] px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href);

          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                active
                  ? "font-medium text-[var(--foreground)]"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]",
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { Home, PenLine, Search, UserRound, WalletCards } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Feed", icon: Home },  { href: "/search", label: "Search", icon: Search },
  { href: "/#composer", label: "Write", icon: PenLine },
  { href: "/wallet", label: "Wallet", icon: WalletCards },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();
  return <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface-overlay)] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden"><div className="mx-auto grid max-w-md grid-cols-5 gap-1">{items.map(({ href, label, icon: Icon }) => { const active = href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href); return <Link key={label} href={href} className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors ${active ? "bg-[var(--accent-soft)] text-[var(--primary-deep)]" : "text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"}`} aria-current={active ? "page" : undefined}><Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span></Link>; })}</div></nav>;
}

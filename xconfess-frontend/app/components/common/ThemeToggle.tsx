"use client";

import { useTheme } from "../../lib/hooks/useTheme";
import { Sun, Moon, Laptop } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1" />
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
      <button
        onClick={() => setTheme("light")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 ${
          theme === "light"
            ? "bg-[var(--accent-soft)] text-[var(--primary-deep)] shadow-sm"
            : "text-[var(--secondary)] hover:text-[var(--foreground)]"
        }`}
        aria-label="Light mode"
        title="Light Mode"
      >
        <Sun size={14} />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 ${
          theme === "dark"
            ? "bg-[var(--accent-soft)] text-[var(--primary-deep)] shadow-sm"
            : "text-[var(--secondary)] hover:text-[var(--foreground)]"
        }`}
        aria-label="Dark mode"
        title="Dark Mode"
      >
        <Moon size={14} />
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 ${
          theme === "system"
            ? "bg-[var(--accent-soft)] text-[var(--primary-deep)] shadow-sm"
            : "text-[var(--secondary)] hover:text-[var(--foreground)]"
        }`}
        aria-label="System preference"
        title="System Preference"
      >
        <Laptop size={14} />
      </button>
    </div>
  );
}

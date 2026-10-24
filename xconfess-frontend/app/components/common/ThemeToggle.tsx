"use client";

import { useTheme } from "../../lib/hooks/useTheme";
import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden="true" />;
  }

  const Icon = theme === "system" ? Laptop : resolvedTheme === "dark" ? Moon : Sun;
  const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      aria-label={theme === "system" ? "Theme: system preference" : "Theme: " + theme}
      title={"Switch to " + nextTheme + " theme"}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
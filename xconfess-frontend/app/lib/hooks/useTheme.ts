"use client";

import { useTheme as useThemeContext } from "../providers/ThemeProvider";

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useThemeContext();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  };

  return {
    theme,
    setTheme,
    toggleTheme,
    resolvedTheme,
  };
}

"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { SearchSuggestions, type SuggestionItem } from "./SearchSuggestions";
import { useSearchHistory } from "@/app/lib/hooks/useSearchHistory";
import { cn } from "@/app/lib/utils/cn";

const POPULAR: string[] = [
  "love",
  "imposter syndrome",
  "secret",
  "coding",
  "midnight",
  "coffee",
];

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  onFocus?: () => void; // Added to satisfy parent page orchestration requirements
}

function buildSuggestions(
  query: string,
  recent: string[],
  popular: string[]
): { items: SuggestionItem[]; hasRecent: boolean } {
  const q = query.trim().toLowerCase();
  if (q) {
    return {
      items: [{ value: query.trim(), type: "suggestion" }],
      hasRecent: false,
    };
  }
  if (recent.length > 0) {
    return {
      items: recent.map((v) => ({ value: v, type: "recent" as const })),
      hasRecent: true,
    };
  }
  return {
    items: popular.map((v) => ({ value: v, type: "popular" as const })),
    hasRecent: false,
  };
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search confessions...",
  className,
  "aria-label": ariaLabel = "Search confessions",
  onFocus, // Destructured safely
}: SearchInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { history, add, clear } = useSearchHistory();

  const { items, hasRecent } = buildSuggestions(value, history, POPULAR);
  const maxIndex = Math.max(0, items.length - 1);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(
    (v: string) => {
      const q = v.trim();
      if (!q) return;
      onChange(q);
      onSubmit(q);
      add(q);
      closeDropdown();
      inputRef.current?.blur();
    },
    [onChange, onSubmit, add, closeDropdown]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = value.trim();
      if (q) {
        onSubmit(q);
        add(q);
      }
      closeDropdown();
      inputRef.current?.blur();
    },
    [value, onSubmit, add, closeDropdown]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || items.length === 0) {
        if (e.key === "Escape") {
          closeDropdown();
          inputRef.current?.blur();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i >= maxIndex ? 0 : i + 1));
          return;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i <= 0 ? maxIndex : i - 1));
          return;
        case "Enter": {
          e.preventDefault();
          const target = items[selectedIndex];
          if (target) handleSelect(target.value);
          else handleSubmit(e as unknown as React.FormEvent);
          return;
        }
        case "Escape":
          e.preventDefault();
          closeDropdown();
          inputRef.current?.blur();
          return;
        default:
          break;
      }
    },
    [isOpen, items, maxIndex, selectedIndex, handleSelect, handleSubmit, closeDropdown]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [value, items.length]);

  useEffect(() => {
    const onBlur = () => setTimeout(closeDropdown, 150);
    const el = inputRef.current;
    el?.addEventListener("blur", onBlur);
    return () => {
      el?.removeEventListener("blur", onBlur);
    };
  }, [closeDropdown]);

  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeDropdown]);

  const showDropdown = isOpen && items.length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative flex items-center">
          <Search
            className="absolute left-3 h-4 w-4 text-zinc-500 pointer-events-none"
            aria-hidden
          />
          <Input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setIsOpen(true);
              if (onFocus) onFocus(); // Safely bubble focus transitions up to parent overlay layouts
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-controls="search-suggestions"
            aria-expanded={showDropdown}
            aria-activedescendant={showDropdown ? `suggestion-${selectedIndex}` : undefined}
            role="combobox"
            autoComplete="off"
            data-search-input
            className="pl-10 pr-10 rounded-xl border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500"
          />
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              className="absolute right-3 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <SearchSuggestions
          items={items}
          isOpen={showDropdown}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onClearHistory={clear}
          hasRecentSection={hasRecent}
          className="left-0 right-0"
        />
      </form>
    </div>
  );
}
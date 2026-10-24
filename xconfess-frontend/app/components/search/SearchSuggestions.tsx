"use client";

import { cn } from "@/app/lib/utils/cn";

export type SuggestionItem = { value: string; type: "recent" | "popular" | "suggestion" };

interface SearchSuggestionsProps {
  items: SuggestionItem[];
  isOpen: boolean;
  selectedIndex: number;
  onSelect: (value: string) => void;
  onClearHistory?: () => void;
  hasRecentSection?: boolean;
  className?: string;
}

export function SearchSuggestions({
  items,
  isOpen,
  selectedIndex,
  onSelect,
  onClearHistory,
  hasRecentSection = false,
  className,
}: SearchSuggestionsProps) {
  if (!isOpen || items.length === 0) return null;

  return (
    <div
      id="search-suggestions"
      role="listbox"
      aria-label="Search suggestions"
      className={cn(
        "absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 shadow-[var(--shadow-popover)]",
        className
      )}
    >
      {hasRecentSection && (
        <div className="px-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Recent searches
          </span>
          {onClearHistory && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearHistory();
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Clear history
            </button>
          )}
        </div>
      )}
      <ul className="list-none" role="group">
        {items.map((item, idx) => (
          <li key={`${item.type}-${item.value}-${idx}`} role="option" aria-selected={idx === selectedIndex} id={idx === selectedIndex ? `suggestion-${idx}` : undefined}>
            <button
              type="button"
              onClick={() => onSelect(item.value)}
              className={cn(
                "w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2",
                idx === selectedIndex
                  ? "bg-[var(--surface-muted)] text-[var(--foreground)]"
                  : "text-[var(--secondary)] hover:bg-[var(--surface-muted)]/50 hover:text-[var(--foreground)]"
              )}
            >
              {item.type === "recent" && (
                <span className="text-[var(--text-muted)]" aria-hidden>
                  🕐
                </span>
              )}
              {item.type === "popular" && (
                <span className="text-[var(--text-muted)]" aria-hidden>
                  🔥
                </span>
              )}
              <span className="truncate">{item.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

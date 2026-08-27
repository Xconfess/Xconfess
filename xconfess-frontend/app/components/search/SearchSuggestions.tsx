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
        "absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-2 shadow-xl",
        className
      )}
    >
      {hasRecentSection && (
        <div className="px-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Recent searches
          </span>
          {onClearHistory && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearHistory();
              }}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
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
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-300 hover:bg-zinc-800/50 hover:text-white"
              )}
            >
              {item.type === "recent" && (
                <span className="text-zinc-500" aria-hidden>
                  🕐
                </span>
              )}
              {item.type === "popular" && (
                <span className="text-zinc-500" aria-hidden>
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

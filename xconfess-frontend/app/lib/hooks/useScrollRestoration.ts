'use client';

import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'xconfess_scroll_positions';

interface ScrollState {
  [path: string]: number;
}

function readPositions(): ScrollState {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePositions(positions: ScrollState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // quota exceeded — silently ignore
  }
}

/**
 * Saves and restores scroll position for a page keyed by pathname.
 *
 * - Saves on scroll (debounced 300ms), beforeunload, and visibility change
 * - Restores saved position on mount (via requestAnimationFrame for correct timing)
 * - Clears the stored position after restoration so fresh navigations start at top
 *
 * Usage in a feed/list page:
 *   useScrollRestoration('feed');
 */
export function useScrollRestoration(key: string) {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = readPositions()[key];
    if (typeof saved === 'number' && saved > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, saved);
      });
    }
  }, [key]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const save = () => {
      const positions = readPositions();
      positions[key] = window.scrollY;
      writePositions(positions);
    };

    const handleScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', save);
      clearTimeout(timer);
    };
  }, [key]);
}

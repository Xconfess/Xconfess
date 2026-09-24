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
 * - Restores saved position on mount, retrying per frame while content renders
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
    if (typeof saved !== 'number' || saved <= 0) return;

    // Cached feed pages render and virtualized rows get measured over a few
    // frames, so the page may be too short on the first try. Retry each frame
    // until we land within a couple of pixels, for up to ~1s, and back off as
    // soon as the user scrolls themselves.
    let frame = 0;
    let rafId = 0;
    const cancel = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('keydown', cancel);
    };
    const attempt = () => {
      window.scrollTo(0, saved);
      if (Math.abs(window.scrollY - saved) <= 2 || ++frame >= 60) {
        cancel();
        return;
      }
      rafId = requestAnimationFrame(attempt);
    };
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    rafId = requestAnimationFrame(attempt);
    return cancel;
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

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(timer);
    };
  }, [key]);
}

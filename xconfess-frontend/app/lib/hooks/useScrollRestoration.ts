'use client';

import { useEffect, useRef } from 'react';
import {
  captureScrollAnchor,
  isPositionRestored,
  readScrollPositions,
  resolveRestoreTarget,
  writeScrollPositions,
  type ScrollPosition,
} from '@/app/lib/utils/scrollPositions';

const MAX_RESTORE_FRAMES = 60;

interface UseScrollRestorationOptions {
  /**
   * Signals that the content the position refers to is on screen. Cached
   * feed pages render over several frames, so restoring before the content
   * exists would scroll to a position that is not reachable yet.
   */
  contentReady?: boolean;
}

/**
 * Saves and restores scroll position for a page keyed by pathname.
 *
 * - Saves on scroll (debounced 300ms), beforeunload, and visibility change
 * - Restores saved position on mount, retrying per frame while content renders
 *
 * The saved position is anchored to the list item that was at the top of the
 * viewport (see `app/lib/utils/scrollPositions`), so returning to a feed
 * whose contents were refreshed still lands on the same item.
 *
 * Usage in a feed/list page:
 *   useScrollRestoration('feed');
 */
export function useScrollRestoration(
  key: string,
  options: UseScrollRestorationOptions = {},
) {
  const { contentReady = true } = options;
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    if (!contentReady) return;

    const saved = readScrollPositions()[key];
    if (!saved || !(saved.y > 0)) {
      restoredRef.current = true;
      return;
    }

    restoredRef.current = true;

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
      window.scrollTo(0, resolveRestoreTarget(saved));
      if (isPositionRestored(saved) || ++frame >= MAX_RESTORE_FRAMES) {
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
  }, [key, contentReady]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const save = () => {
      const positions = readScrollPositions();
      positions[key] = {
        y: window.scrollY,
        anchor: captureScrollAnchor(),
      };
      writeScrollPositions(positions);
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

export type { ScrollPosition };

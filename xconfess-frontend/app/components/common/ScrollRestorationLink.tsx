'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { captureScrollAnchor, writeScrollPosition } from '@/app/lib/utils/scrollPositions';

/**
 * A Link that saves the current scroll position before navigating.
 * Use this for links that leave the feed/list page so the user can
 * return to the same scroll position.
 *
 * The position is anchored to the list item that is at the top of the
 * viewport, so returning to a list whose contents were refreshed while the
 * user was away still lands on the same item.
 */
export function ScrollRestorationLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      onClick={(e) => {
        // Keyed by pathname to match useScrollRestoration(pathname) in the feed.
        writeScrollPosition(window.location.pathname, {
          y: window.scrollY,
          anchor: captureScrollAnchor(),
        });
        onClick?.(e);
      }}
      {...props}
    />
  );
}

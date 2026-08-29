'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

const SCROLL_KEY = 'feed';

function saveScrollPosition() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem('xconfess_scroll_positions');
    const positions = raw ? JSON.parse(raw) : {};
    positions[SCROLL_KEY] = window.scrollY;
    sessionStorage.setItem('xconfess_scroll_positions', JSON.stringify(positions));
  } catch {
    // silently ignore
  }
}

/**
 * A Link that saves the current scroll position before navigating.
 * Use this for links that leave the feed/list page so the user can
 * return to the same scroll position.
 */
export function ScrollRestorationLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      onClick={(e) => {
        saveScrollPosition();
        onClick?.(e);
      }}
      {...props}
    />
  );
}

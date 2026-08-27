import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface UseVirtualScrollOptions {
  itemCount: number;
  estimateSize: number;
  overscan?: number;
}

export function useVirtualScroll({ itemCount, estimateSize, overscan = 5 }: UseVirtualScrollOptions) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    totalSize: virtualizer.getTotalSize(),
    virtualItems: virtualizer.getVirtualItems(),
  };
}

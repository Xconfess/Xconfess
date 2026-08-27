export function optimizeImageUrl(url: string, width: number): string {
  if (!url) return url;
  
  if (url.includes('cloudinary.com')) {
    const parts = url.split('/upload/');
    if (parts.length === 2) {
      return `${parts[0]}/upload/w_${width},f_auto,q_auto/${parts[1]}`;
    }
  }
  
  return url;
}

export function prefetchRoute(href: string) {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
}

export function lazyLoad<T>(
  factory: () => Promise<{ default: T }>,
  minDelay: number = 0
): Promise<{ default: T }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      factory().then(resolve);
    }, minDelay);
  });
}

export const measurePerformance = {
  mark(name: string) {
    if (typeof window !== 'undefined' && window.performance) {
      performance.mark(name);
    }
  },

  measure(name: string, startMark: string, endMark?: string) {
    if (typeof window !== 'undefined' && window.performance) {
      try {
        if (endMark) {
          performance.measure(name, startMark, endMark);
        } else {
          performance.measure(name, startMark);
        }
        
        const entries = performance.getEntriesByName(name);
        if (entries.length > 0) {
          const duration = entries[entries.length - 1].duration;
          if (duration > 100) {
            console.warn(`Performance: ${name} took ${duration.toFixed(2)}ms`);
          }
        }
      } catch (e) {
        console.warn('Performance measurement failed:', e);
      }
    }
  },

  clearMarks() {
    if (typeof window !== 'undefined' && window.performance) {
      performance.clearMarks();
      performance.clearMeasures();
    }
  }
};

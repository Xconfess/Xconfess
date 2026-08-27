export class PerformanceMonitor {
  static measurePageLoad() {
    if (typeof window === 'undefined') return;

    window.addEventListener('load', () => {
      const perfData = window.performance.timing;
      const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
      const connectTime = perfData.responseEnd - perfData.requestStart;

      console.log('Performance Metrics:');
      console.log(`  Page Load: ${pageLoadTime}ms`);
      console.log(`  Server Response: ${connectTime}ms`);
      
      this.measureCoreWebVitals();
    });
  }

  static measureCoreWebVitals() {
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          console.log(`  LCP: ${Math.round(lastEntry.renderTime || lastEntry.loadTime)}ms`);
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch {
        console.warn('LCP measurement not supported');
      }

      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            console.log(`  FID: ${Math.round(entry.processingStart - entry.startTime)}ms`);
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
      } catch {
        console.warn('FID measurement not supported');
      }
    }
  }

  static measureRenderTime(componentName: string, startTime: number) {
    const duration = performance.now() - startTime;
    if (duration > 50) {
      console.log(`${componentName} rendered in ${duration.toFixed(2)}ms`);
    }
  }

  static async measureApiCall(name: string, apiCall: () => Promise<any>) {
    const start = performance.now();
    try {
      const result = await apiCall();
      const duration = performance.now() - start;
      console.log(`API ${name}: ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(`API ${name} failed after ${duration.toFixed(2)}ms`);
      throw error;
    }
  }
}

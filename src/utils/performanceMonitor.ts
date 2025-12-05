/**
 * Performance Monitoring Utilities
 *
 * Tracks and reports performance metrics for the application
 */

interface PerformanceMetrics {
  FCP?: number; // First Contentful Paint
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  TTFB?: number; // Time to First Byte
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};

  constructor() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      this.observePerformance();
    }
  }

  private observePerformance() {
    // Observe Largest Contentful Paint (LCP)
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number };
        this.metrics.LCP = lastEntry.startTime;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      // LCP not supported
    }

    // Observe First Input Delay (FID)
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: PerformanceEntry & { processingStart?: number }) => {
          this.metrics.FID = entry.processingStart ? entry.processingStart - entry.startTime : 0;
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      // FID not supported
    }

    // Observe Cumulative Layout Shift (CLS)
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: PerformanceEntry & { value?: number; hadRecentInput?: boolean }) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value || 0;
            this.metrics.CLS = clsValue;
          }
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      // CLS not supported
    }

    // Get Navigation Timing metrics
    if (window.performance && window.performance.getEntriesByType) {
      window.addEventListener('load', () => {
        const navEntries = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navEntries) {
          this.metrics.TTFB = navEntries.responseStart - navEntries.requestStart;
          this.metrics.FCP = navEntries.domContentLoadedEventEnd - navEntries.fetchStart;
        }
      });
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Log metrics to console (only in development)
   */
  logMetrics() {
    if (import.meta.env.DEV) {
      console.table(this.metrics);
    }
  }

  /**
   * Send metrics to analytics (placeholder for future implementation)
   */
  sendMetrics() {
    // TODO: Implement analytics integration
    // This could send to Google Analytics, Sentry, or custom endpoint
  }

  /**
   * Get performance grade based on Core Web Vitals
   */
  getPerformanceGrade(): { grade: string; details: Record<string, string> } {
    const details: Record<string, string> = {};

    // LCP thresholds (ms): Good < 2500, Needs Improvement < 4000, Poor >= 4000
    if (this.metrics.LCP !== undefined) {
      if (this.metrics.LCP < 2500) details.LCP = '✓ Good';
      else if (this.metrics.LCP < 4000) details.LCP = '⚠ Needs Improvement';
      else details.LCP = '✗ Poor';
    }

    // FID thresholds (ms): Good < 100, Needs Improvement < 300, Poor >= 300
    if (this.metrics.FID !== undefined) {
      if (this.metrics.FID < 100) details.FID = '✓ Good';
      else if (this.metrics.FID < 300) details.FID = '⚠ Needs Improvement';
      else details.FID = '✗ Poor';
    }

    // CLS thresholds: Good < 0.1, Needs Improvement < 0.25, Poor >= 0.25
    if (this.metrics.CLS !== undefined) {
      if (this.metrics.CLS < 0.1) details.CLS = '✓ Good';
      else if (this.metrics.CLS < 0.25) details.CLS = '⚠ Needs Improvement';
      else details.CLS = '✗ Poor';
    }

    // Calculate overall grade
    const scores = Object.values(details);
    const goodCount = scores.filter(s => s.startsWith('✓')).length;
    const total = scores.length;

    let grade = 'A';
    if (goodCount === total) grade = 'A';
    else if (goodCount >= total * 0.7) grade = 'B';
    else if (goodCount >= total * 0.5) grade = 'C';
    else grade = 'D';

    return { grade, details };
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Expose to window in development for debugging
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).performanceMonitor = performanceMonitor;
}
